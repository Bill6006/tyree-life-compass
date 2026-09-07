import { blocks, definitionVersion, questionsFor, readings, scoreVersion, type Answers, type CheckIn, type Draft, type ReadingId } from './readings';
import { AppDatabase } from './storage';
import { defaults, publicPreferences, validTime, type Preferences } from './preferences';
import { csvCell } from './privateData';

export type Backup = { format: 'tyree-life-compass'; schemaVersion: 1 | 2; exportedAt: string; checkIns: CheckIn[]; draft: Draft | null; settings?: Omit<Preferences, 'privateEnabled'> };
const invalid = () => new Error('This file is not a supported Life Compass backup. Nothing was changed.');
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const date = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
const nonnegative = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function exact(value: Record<string, unknown>, keys: string[], optional: string[] = []) {
  if (keys.some((key) => !(key in value)) || Object.keys(value).some((key) => ![...keys, ...optional].includes(key))) throw invalid();
}
function extras(value: Record<string, unknown>) {
  if (value.depth !== undefined && value.depth !== 'standard' && value.depth !== 'brief') throw invalid();
  if (value.evening !== undefined) {
    if (!isObject(value.evening)) throw invalid();
    exact(value.evening, [], ['minimumWin', 'caffeineAfterMidday', 'lateDinner', 'closeToGod']);
    if (value.block !== 'evening' && Object.keys(value.evening).length) throw invalid();
    for (const [key, field] of Object.entries(value.evening)) if (key === 'minimumWin' ? typeof field !== 'string' || !field.trim() || field.length > 240 || /[\r\n]/.test(field) : typeof field !== 'boolean') throw invalid();
  }
}
function cleanExtras(r: CheckIn | Draft) {
  return { ...(r.depth === undefined ? {} : { depth: r.depth }), ...(r.evening === undefined ? {} : { evening: Object.fromEntries(['minimumWin', 'caffeineAfterMidday', 'lateDinner', 'closeToGod'].filter((k) => Object.hasOwn(r.evening!, k)).map((k) => [k, r.evening![k as keyof typeof r.evening]])) }) };
}
function validateAnswers(value: unknown, block: CheckIn['block'], depth: CheckIn['depth'] = 'standard'): asserts value is Answers {
  if (!isObject(value) || Object.entries(value).some(([id, anchor]) => !questionsFor(block, depth).includes(id as ReadingId) || !Number.isInteger(anchor) || Number(anchor) < 0 || Number(anchor) > 4)) throw invalid();
}
export function parseBackup(text: string): Backup {
  if (text.length > 20_000_000) throw new Error('This backup is too large to restore here. Nothing was changed.');
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw invalid(); }
  if (!isObject(data)) throw invalid();
  exact(data, ['format', 'schemaVersion', 'exportedAt', 'checkIns', 'draft'], data.schemaVersion === 2 ? ['settings'] : []);
  if (data.format !== 'tyree-life-compass' || data.schemaVersion !== 1 && data.schemaVersion !== 2 || !date(data.exportedAt) || !Array.isArray(data.checkIns) || data.checkIns.length > 50000) throw invalid();
  if (data.settings !== undefined) {
    const p = data.settings;
    if (!isObject(p)) throw invalid();
    exact(p, ['key', 'depth', 'frequency', 'lowDemand', 'quietStart', 'quietEnd', 'times', 'faithEnabled']);
    if (p.key !== 'preferences' || !['standard','brief'].includes(String(p.depth)) || ![0,1,2,3].includes(p.frequency as number) || typeof p.lowDemand !== 'boolean' || typeof p.faithEnabled !== 'boolean' || !validTime(p.quietStart) || !validTime(p.quietEnd) || !isObject(p.times)) throw invalid();
    exact(p.times, ['morning','afternoon','evening']); if (!Object.values(p.times).every(validTime)) throw invalid();
  }
  const ids = new Set<string>();
  for (const record of data.checkIns) {
    if (!isObject(record)) throw invalid();
    exact(record, ['id', 'block', 'occurredAt', 'reportedAt', 'updatedAt', 'answers', 'definitionVersion', 'scoreVersion', 'answeringMs'], data.schemaVersion === 2 ? ['depth','evening'] : []);
    extras(record);
    if (!uuid(record.id) || ids.has(record.id as string) || !blocks.includes(record.block as CheckIn['block']) || !date(record.occurredAt) || !date(record.reportedAt) || !date(record.updatedAt) || record.definitionVersion !== definitionVersion || record.scoreVersion !== scoreVersion || !nonnegative(record.answeringMs)) throw invalid();
    validateAnswers(record.answers, record.block as CheckIn['block'], record.depth as CheckIn['depth']);
    if (!Object.keys(record.answers).length && !Object.keys(record.evening ?? {}).length) throw invalid();
    ids.add(record.id as string);
  }
  if (data.draft !== null) {
    const draft = data.draft;
    if (!isObject(draft)) throw invalid();
    exact(draft, ['key', 'id', 'revision', 'block', 'occurredAt', 'answers', 'index', 'answeringMs', 'editingId', 'editingUpdatedAt'], data.schemaVersion === 2 ? ['depth','evening'] : []);
    extras(draft);
    if (draft.key !== 'active' || !uuid(draft.id) || !nonnegative(draft.revision) || !blocks.includes(draft.block as CheckIn['block']) || !date(draft.occurredAt) || !nonnegative(draft.answeringMs) || !nonnegative(draft.index) || Number(draft.index) > questionsFor(draft.block as CheckIn['block'], draft.depth as CheckIn['depth']).length || (draft.editingId === null ? draft.editingUpdatedAt !== null : !uuid(draft.editingId) || !date(draft.editingUpdatedAt))) throw invalid();
    validateAnswers(draft.answers, draft.block as CheckIn['block'], draft.depth as CheckIn['depth']);
  }
  return data as Backup;
}
function publicAnswers(answers: Answers, block: CheckIn['block']): Answers {
  return Object.fromEntries(questionsFor(block).filter((id) => answers[id] !== undefined).map((id) => [id, answers[id]]));
}
// Explicit allowlists keep future private fields out of ordinary exports.
export function makeBackup(records: CheckIn[], draft: Draft | null, now = new Date().toISOString(), settings?: Preferences): Backup {
  return { format: 'tyree-life-compass', schemaVersion: 2, exportedAt: now, ...(settings ? { settings: publicPreferences(settings) } : {}),
    checkIns: records.map((r) => ({ id: r.id, block: r.block, occurredAt: r.occurredAt, reportedAt: r.reportedAt,
      updatedAt: r.updatedAt, answers: publicAnswers(r.answers, r.block), definitionVersion: r.definitionVersion, scoreVersion: r.scoreVersion, answeringMs: r.answeringMs, ...cleanExtras(r) })),
    draft: draft ? { key: 'active', id: draft.id, revision: draft.revision, block: draft.block, occurredAt: draft.occurredAt,
      answers: publicAnswers(draft.answers, draft.block), index: draft.index, answeringMs: draft.answeringMs,
      editingId: draft.editingId, editingUpdatedAt: draft.editingUpdatedAt, ...cleanExtras(draft) } : null };
}
export function toCsv(backup: Backup): string {
  const rows: (string | number)[][] = [['format_version', 'record_type', 'id', 'block', 'occurred_at_utc', 'reported_at_utc', 'updated_at_utc', 'definition_version', 'score_recipe', 'active_answering_ms', 'reading', 'phrase', 'anchor_index_0_to_4']];
  for (const item of [...backup.checkIns.map((r) => ({ r, type: 'saved' })), ...(backup.draft ? [{ r: backup.draft, type: 'draft' }] : [])]) {
    const { r, type } = item;
    for (const id of questionsFor(r.block, r.depth)) {
      const value = r.answers[id];
      rows.push([1, type, r.id, r.block, r.occurredAt, 'reportedAt' in r ? r.reportedAt : '', 'updatedAt' in r ? r.updatedAt : '', definitionVersion, scoreVersion, r.answeringMs, id, value === undefined ? 'Not logged yet' : readings[id].anchors[value], value ?? '']);
    }
    for (const [key, value] of Object.entries(cleanExtras(r).evening ?? {})) rows.push([2, type, r.id, r.block, r.occurredAt, 'reportedAt' in r ? r.reportedAt : '', 'updatedAt' in r ? r.updatedAt : '', definitionVersion, scoreVersion, r.answeringMs, key, typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value), '']);
  }
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
export async function restoreBackup(database: AppDatabase, input: Backup, restoreSettings = false): Promise<{ added: number; kept: number; draftRestored: boolean }> {
  const backup = parseBackup(JSON.stringify(input));
  return database.transaction('rw', database.checkIns, database.drafts, database.preferences, async () => {
    const existing = new Set(await database.checkIns.toCollection().primaryKeys());
    const added = backup.checkIns.filter((record) => !existing.has(record.id));
    await database.checkIns.bulkAdd(added);
    if (restoreSettings && backup.settings) {
      const old = await database.preferences.get('preferences') ?? defaults;
      await database.preferences.put({ ...backup.settings, privateEnabled: old.privateEnabled });
    }
    let draftRestored = false;
    if (backup.draft && !await database.drafts.get('active')) {
      const original = backup.draft.editingId ? await database.checkIns.get(backup.draft.editingId) : null;
      // An obsolete edit draft must never overwrite a more recent saved reading.
      if (backup.draft.editingId ? original?.updatedAt === backup.draft.editingUpdatedAt : !await database.checkIns.get(backup.draft.id)) {
        await database.drafts.add(backup.draft);
        draftRestored = true;
      }
    }
    return { added: added.length, kept: backup.checkIns.length - added.length, draftRestored };
  });
}

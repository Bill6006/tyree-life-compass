import { blocks, definitionVersion, questionsFor, readings, scoreVersion, type Answers, type CheckIn, type Draft, type ReadingId } from './readings';
import { AppDatabase } from './storage';

export type Backup = { format: 'tyree-life-compass'; schemaVersion: 1; exportedAt: string; checkIns: CheckIn[]; draft: Draft | null };
const invalid = () => new Error('This file is not a supported Life Compass backup. Nothing was changed.');
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const date = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
const nonnegative = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))) throw invalid();
}
function validateAnswers(value: unknown, block: CheckIn['block']): asserts value is Answers {
  if (!isObject(value) || Object.entries(value).some(([id, anchor]) => !questionsFor(block).includes(id as ReadingId) || !Number.isInteger(anchor) || Number(anchor) < 0 || Number(anchor) > 4)) throw invalid();
}
export function parseBackup(text: string): Backup {
  if (text.length > 20_000_000) throw new Error('This backup is too large to restore here. Nothing was changed.');
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw invalid(); }
  if (!isObject(data)) throw invalid();
  exact(data, ['format', 'schemaVersion', 'exportedAt', 'checkIns', 'draft']);
  if (data.format !== 'tyree-life-compass' || data.schemaVersion !== 1 || !date(data.exportedAt) || !Array.isArray(data.checkIns) || data.checkIns.length > 50000) throw invalid();
  const ids = new Set<string>();
  for (const record of data.checkIns) {
    if (!isObject(record)) throw invalid();
    exact(record, ['id', 'block', 'occurredAt', 'reportedAt', 'updatedAt', 'answers', 'definitionVersion', 'scoreVersion', 'answeringMs']);
    if (!uuid(record.id) || ids.has(record.id as string) || !blocks.includes(record.block as CheckIn['block']) || !date(record.occurredAt) || !date(record.reportedAt) || !date(record.updatedAt) || record.definitionVersion !== definitionVersion || record.scoreVersion !== scoreVersion || !nonnegative(record.answeringMs)) throw invalid();
    validateAnswers(record.answers, record.block as CheckIn['block']);
    if (!Object.keys(record.answers).length) throw invalid();
    ids.add(record.id as string);
  }
  if (data.draft !== null) {
    const draft = data.draft;
    if (!isObject(draft)) throw invalid();
    exact(draft, ['key', 'id', 'revision', 'block', 'occurredAt', 'answers', 'index', 'answeringMs', 'editingId', 'editingUpdatedAt']);
    if (draft.key !== 'active' || !uuid(draft.id) || !nonnegative(draft.revision) || !blocks.includes(draft.block as CheckIn['block']) || !date(draft.occurredAt) || !nonnegative(draft.answeringMs) || !nonnegative(draft.index) || Number(draft.index) > questionsFor(draft.block as CheckIn['block']).length || (draft.editingId === null ? draft.editingUpdatedAt !== null : !uuid(draft.editingId) || !date(draft.editingUpdatedAt))) throw invalid();
    validateAnswers(draft.answers, draft.block as CheckIn['block']);
  }
  return data as Backup;
}
function publicAnswers(answers: Answers, block: CheckIn['block']): Answers {
  return Object.fromEntries(questionsFor(block).filter((id) => answers[id] !== undefined).map((id) => [id, answers[id]]));
}
// Explicit allowlists keep future private fields out of ordinary exports.
export function makeBackup(records: CheckIn[], draft: Draft | null, now = new Date().toISOString()): Backup {
  return { format: 'tyree-life-compass', schemaVersion: 1, exportedAt: now,
    checkIns: records.map((r) => ({ id: r.id, block: r.block, occurredAt: r.occurredAt, reportedAt: r.reportedAt,
      updatedAt: r.updatedAt, answers: publicAnswers(r.answers, r.block), definitionVersion: r.definitionVersion, scoreVersion: r.scoreVersion, answeringMs: r.answeringMs })),
    draft: draft ? { key: 'active', id: draft.id, revision: draft.revision, block: draft.block, occurredAt: draft.occurredAt,
      answers: publicAnswers(draft.answers, draft.block), index: draft.index, answeringMs: draft.answeringMs,
      editingId: draft.editingId, editingUpdatedAt: draft.editingUpdatedAt } : null };
}
export function toCsv(backup: Backup): string {
  const rows: (string | number)[][] = [['format_version', 'record_type', 'id', 'block', 'occurred_at_utc', 'reported_at_utc', 'updated_at_utc', 'definition_version', 'score_recipe', 'active_answering_ms', 'reading', 'phrase', 'anchor_index_0_to_4']];
  for (const item of [...backup.checkIns.map((r) => ({ r, type: 'saved' })), ...(backup.draft ? [{ r: backup.draft, type: 'draft' }] : [])]) {
    const { r, type } = item;
    for (const id of questionsFor(r.block)) {
      const value = r.answers[id];
      rows.push([1, type, r.id, r.block, r.occurredAt, 'reportedAt' in r ? r.reportedAt : '', 'updatedAt' in r ? r.updatedAt : '', definitionVersion, scoreVersion, r.answeringMs, id, value === undefined ? 'Not logged yet' : readings[id].anchors[value], value ?? '']);
    }
  }
  return '\uFEFF' + rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
}
export async function restoreBackup(database: AppDatabase, input: Backup): Promise<{ added: number; kept: number; draftRestored: boolean }> {
  const backup = parseBackup(JSON.stringify(input));
  return database.transaction('rw', database.checkIns, database.drafts, async () => {
    const existing = new Set(await database.checkIns.toCollection().primaryKeys());
    const added = backup.checkIns.filter((record) => !existing.has(record.id));
    await database.checkIns.bulkAdd(added);
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

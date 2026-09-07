import type { AppDatabase } from './storage';
import { csvCell, validDay } from './privateData';
import { activityLabels, becomingDefaults, type BecomingData, type BecomingProfile, type Commitment, type LifeActivity, type Sitting } from './becomingTypes';

export type BecomingBackup = BecomingData & { format: 'life-compass-becoming'; schemaVersion: 1; exportedAt: string };
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const timestamp = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString() === v;
const line = (v: unknown, max: number, required = true) => typeof v === 'string' && (!required || Boolean(v.trim())) && v.length <= max && !/[\r\n]/.test(v);
const revision = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
function exact(v: unknown, keys: string[]): v is Record<string, unknown> { return Boolean(v) && typeof v === 'object' && !Array.isArray(v) && Object.keys(v!).length === keys.length && Object.keys(v!).every((key) => keys.includes(key)); }
const invalid = () => new Error('This is not a supported Becoming backup. Nothing was changed.');
export function parseBecomingBackup(text: string): BecomingBackup {
  if (text.length > 20_000_000) throw invalid();
  let b: unknown; try { b = JSON.parse(text); } catch { throw invalid(); }
  if (!exact(b, ['format','schemaVersion','exportedAt','commitments','sittings','activities','profile']) || b.format !== 'life-compass-becoming' || b.schemaVersion !== 1 || !timestamp(b.exportedAt) || !Array.isArray(b.commitments) || !Array.isArray(b.sittings) || !Array.isArray(b.activities) || b.commitments.length > 1000 || b.sittings.length > 50000 || b.activities.length > 50000) throw invalid();
  const commitmentIds = new Set<string>(), sittingIds = new Map<string, Sitting>(), activityIds = new Set<string>(), resumedIds = new Set<string>(), openIds = new Set<string>();
  for (const c of b.commitments) {
    if (!exact(c, ['id','title','nextStep','stopWhen','isStudy','createdAt','updatedAt','revision']) || !uuid(c.id) || commitmentIds.has(c.id as string) || !line(c.title, 100) || !line(c.nextStep, 240) || !line(c.stopWhen, 240) || typeof c.isStudy !== 'boolean' || !timestamp(c.createdAt) || !timestamp(c.updatedAt) || !revision(c.revision)) throw invalid();
    commitmentIds.add(c.id as string);
  }
  for (const s of b.sittings) {
    if (!exact(s, ['id','commitmentId','title','step','stopWhen','isStudy','startedOn','finishedOn','reportedAt','updatedAt','revision']) || !uuid(s.id) || sittingIds.has(s.id as string) || !commitmentIds.has(s.commitmentId as string) || !line(s.title, 100) || !line(s.step, 240) || !line(s.stopWhen, 240) || typeof s.isStudy !== 'boolean' || !validDay(s.startedOn) || s.finishedOn !== null && (!validDay(s.finishedOn) || s.finishedOn < s.startedOn) || !timestamp(s.reportedAt) || !timestamp(s.updatedAt) || !revision(s.revision)) throw invalid();
    if (s.finishedOn === null) { if (openIds.has(s.commitmentId as string)) throw invalid(); openIds.add(s.commitmentId as string); }
    sittingIds.set(s.id as string, s as Sitting);
  }
  for (const a of b.activities) {
    if (!exact(a, ['id','kind','day','note','sittingId','reportedAt','updatedAt','revision']) || !uuid(a.id) || activityIds.has(a.id as string) || typeof a.kind !== 'string' || !Object.hasOwn(activityLabels, a.kind) || !validDay(a.day) || !line(a.note, 240, false) || a.sittingId !== null && !uuid(a.sittingId) || !timestamp(a.reportedAt) || !timestamp(a.updatedAt) || !revision(a.revision)) throw invalid();
    if (a.sittingId !== null) {
      const s = sittingIds.get(a.sittingId as string);
      if (!s?.isStudy || a.kind !== 'study-resumed' || resumedIds.has(s.id) || a.day < s.startedOn || s.finishedOn && a.day > s.finishedOn) throw invalid();
      resumedIds.add(s.id);
    }
    activityIds.add(a.id as string);
  }
  const p = b.profile;
  if (!exact(p, ['key','direction','protectedId','studyEvenings','churchSaturday','revision']) || p.key !== 'becoming' || !line(p.direction, 240, false) || p.protectedId !== null && !commitmentIds.has(p.protectedId as string) || typeof p.studyEvenings !== 'boolean' || typeof p.churchSaturday !== 'boolean' || !revision(p.revision)) throw invalid();
  return b as BecomingBackup;
}

// Explicit field projections prevent future unrelated/private fields from entering these exports.
function cleanCommitment(c: Commitment): Commitment { return { id: c.id, title: c.title, nextStep: c.nextStep, stopWhen: c.stopWhen, isStudy: c.isStudy, createdAt: c.createdAt, updatedAt: c.updatedAt, revision: c.revision }; }
function cleanSitting(s: Sitting): Sitting { return { id: s.id, commitmentId: s.commitmentId, title: s.title, step: s.step, stopWhen: s.stopWhen, isStudy: s.isStudy, startedOn: s.startedOn, finishedOn: s.finishedOn, reportedAt: s.reportedAt, updatedAt: s.updatedAt, revision: s.revision }; }
function cleanActivity(a: LifeActivity): LifeActivity { return { id: a.id, kind: a.kind, day: a.day, note: a.note, sittingId: a.sittingId, reportedAt: a.reportedAt, updatedAt: a.updatedAt, revision: a.revision }; }
function cleanProfile(p: BecomingProfile): BecomingProfile { return { key: 'becoming', direction: p.direction, protectedId: p.protectedId, studyEvenings: p.studyEvenings, churchSaturday: p.churchSaturday, revision: p.revision }; }
export async function becomingBackup(db: AppDatabase): Promise<BecomingBackup> {
  return db.transaction('r', db.commitments, db.sittings, db.lifeActivities, db.becomingProfile, async () => ({ format: 'life-compass-becoming', schemaVersion: 1, exportedAt: new Date().toISOString(), commitments: (await db.commitments.toArray()).map(cleanCommitment), sittings: (await db.sittings.toArray()).map(cleanSitting), activities: (await db.lifeActivities.toArray()).map(cleanActivity), profile: cleanProfile(await db.becomingProfile.get('becoming') ?? becomingDefaults) }));
}
export async function restoreBecoming(db: AppDatabase, input: BecomingBackup, restoreChoices = false) {
  const b = parseBecomingBackup(JSON.stringify(input));
  return db.transaction('rw', db.commitments, db.sittings, db.lifeActivities, db.becomingProfile, async () => {
    let added = 0;
    for (const c of b.commitments) if (!await db.commitments.get(c.id)) { await db.commitments.add(c); added++; }
    for (const s of b.sittings) if (!await db.sittings.get(s.id)) {
      if (s.finishedOn === null && await db.sittings.where('commitmentId').equals(s.commitmentId).filter((old) => old.finishedOn === null).count()) throw new Error('This backup would create two unfinished sittings for a commitment. Keep or finish the current one first. Nothing was changed.');
      await db.sittings.add(s); added++;
    }
    for (const a of b.activities) if (!await db.lifeActivities.get(a.id) && !(a.sittingId && await db.lifeActivities.where('sittingId').equals(a.sittingId).first())) {
      const s = a.sittingId ? await db.sittings.get(a.sittingId) : undefined;
      if (s && (!s.isStudy || a.day < s.startedOn || s.finishedOn && a.day > s.finishedOn)) throw new Error('A study resumption conflicts with the corrected sitting dates. Nothing was changed.');
      await db.lifeActivities.add(a); added++;
    }
    if (restoreChoices) { const old = await db.becomingProfile.get('becoming') ?? becomingDefaults; await db.becomingProfile.put({ ...b.profile, revision: old.revision + 1 }); }
    return added;
  });
}
export function becomingCsv(b: BecomingBackup): string {
  const rows: (string | number | boolean)[][] = [['schema_version','record_type','id','commitment_id','sitting_id','title','next_step','stop_when','is_study','started_on','finished_on','activity_kind','activity_on','note_or_direction','reported_or_created_at','updated_at','revision','protected_commitment_id','study_evenings','church_saturday']];
  const p = b.profile;
  rows.push([1,'profile','becoming','','','','','','','','','','',p.direction,'','',p.revision,p.protectedId ?? '',p.studyEvenings,p.churchSaturday]);
  for (const c of b.commitments) rows.push([1,'commitment',c.id,c.id,'',c.title,c.nextStep,c.stopWhen,c.isStudy,'','','','','',c.createdAt,c.updatedAt,c.revision,'','','']);
  for (const s of b.sittings) rows.push([1,'sitting',s.id,s.commitmentId,s.id,s.title,s.step,s.stopWhen,s.isStudy,s.startedOn,s.finishedOn ?? '','','','',s.reportedAt,s.updatedAt,s.revision,'','','']);
  for (const a of b.activities) rows.push([1,'activity',a.id,'',a.sittingId ?? '','','','','','','',a.kind,a.day,a.note,a.reportedAt,a.updatedAt,a.revision,'','','']);
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

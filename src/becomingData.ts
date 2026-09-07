import type { AppDatabase } from './storage';
import { localDay } from './preferences';
import { validDay } from './privateData';
import { activityLabels, becomingDefaults, type BecomingProfile, type Commitment, type LifeActivity, type Sitting } from './becomingTypes';

const changed = () => new Error('This record changed elsewhere. Close it and reopen the latest version.');
export const today = () => localDay(new Date().toISOString());
export function singleLine(value: string, max: number, required = true): string {
  const result = value.trim();
  if (required && !result || result.length > max || /[\r\n]/.test(result)) throw new Error(`Use ${required ? '1' : '0'} to ${max} characters on one line.`);
  return result;
}
function pastDay(day: string) { if (!validDay(day) || day > today()) throw new Error('Choose today or an earlier valid date.'); }
export async function saveCommitment(db: AppDatabase, fields: Pick<Commitment, 'title' | 'nextStep' | 'stopWhen' | 'isStudy'>, original?: Commitment): Promise<Commitment> {
  const title = singleLine(fields.title, 100), nextStep = singleLine(fields.nextStep, 240), stopWhen = singleLine(fields.stopWhen, 240);
  return db.transaction('rw', db.commitments, db.becomingProfile, async () => {
    const old = original ? await db.commitments.get(original.id) : undefined;
    if (original && old?.revision !== original.revision) throw changed();
    const now = new Date().toISOString();
    const record: Commitment = { id: old?.id ?? crypto.randomUUID(), title, nextStep, stopWhen, isStudy: fields.isStudy, createdAt: old?.createdAt ?? now, updatedAt: now, revision: (old?.revision ?? -1) + 1 };
    await db.commitments.put(record);
    const p = await db.becomingProfile.get('becoming') ?? becomingDefaults;
    if (!p.protectedId) await db.becomingProfile.put({ ...p, protectedId: record.id, revision: p.revision + 1 });
    return record;
  });
}
export async function chooseProtected(db: AppDatabase, id: string | null) {
  await db.transaction('rw', db.commitments, db.becomingProfile, async () => {
    if (id && !await db.commitments.get(id)) throw changed();
    const p = await db.becomingProfile.get('becoming') ?? becomingDefaults;
    await db.becomingProfile.put({ ...p, protectedId: id, revision: p.revision + 1 });
  });
}
export async function saveDirection(db: AppDatabase, direction: string, original: BecomingProfile) {
  direction = singleLine(direction, 240, false);
  await db.transaction('rw', db.becomingProfile, async () => {
    const p = await db.becomingProfile.get('becoming') ?? becomingDefaults;
    if (p.revision !== original.revision) throw changed();
    await db.becomingProfile.put({ ...p, direction, revision: p.revision + 1 });
  });
}
export async function setPlanning(db: AppDatabase, key: 'studyEvenings' | 'churchSaturday', value: boolean) {
  await db.transaction('rw', db.becomingProfile, async () => {
    const p = await db.becomingProfile.get('becoming') ?? becomingDefaults;
    await db.becomingProfile.put({ ...p, [key]: value, revision: p.revision + 1 });
  });
}
export async function startSitting(db: AppDatabase, commitment: Commitment): Promise<Sitting> {
  return db.transaction('rw', db.commitments, db.sittings, async () => {
    const current = await db.commitments.get(commitment.id);
    if (!current || current.revision !== commitment.revision) throw changed();
    const open = await db.sittings.where('commitmentId').equals(current.id).filter((s) => s.finishedOn === null).first();
    if (open) return open;
    const now = new Date().toISOString();
    const sitting: Sitting = { id: crypto.randomUUID(), commitmentId: current.id, title: current.title, step: current.nextStep, stopWhen: current.stopWhen, isStudy: current.isStudy, startedOn: today(), finishedOn: null, reportedAt: now, updatedAt: now, revision: 0 };
    await db.sittings.add(sitting); return sitting;
  });
}
export async function resumeStudy(db: AppDatabase, sitting: Sitting): Promise<LifeActivity> {
  return db.transaction('rw', db.sittings, db.lifeActivities, async () => {
    const current = await db.sittings.get(sitting.id);
    if (!current || !current.isStudy || current.finishedOn || current.revision !== sitting.revision) throw changed();
    if (current.startedOn > today()) throw new Error('Correct the future start date before recording a resumption.');
    const old = await db.lifeActivities.where('sittingId').equals(current.id).first();
    if (old) return old;
    const now = new Date().toISOString();
    const record: LifeActivity = { id: crypto.randomUUID(), kind: 'study-resumed', day: today(), note: '', sittingId: current.id, reportedAt: now, updatedAt: now, revision: 0 };
    await db.lifeActivities.add(record); return record;
  });
}
export async function saveSitting(db: AppDatabase, original: Sitting, fields: Pick<Sitting, 'step' | 'stopWhen' | 'startedOn' | 'finishedOn'>): Promise<void> {
  const step = singleLine(fields.step, 240), stopWhen = singleLine(fields.stopWhen, 240);
  pastDay(fields.startedOn); if (fields.finishedOn !== null) { pastDay(fields.finishedOn); if (fields.finishedOn < fields.startedOn) throw new Error('The finish date must be on or after the start date.'); }
  await db.transaction('rw', db.sittings, db.lifeActivities, async () => {
    const current = await db.sittings.get(original.id);
    if (!current || current.revision !== original.revision) throw changed();
    if (fields.finishedOn === null && await db.sittings.where('commitmentId').equals(current.commitmentId).filter((s) => s.id !== current.id && s.finishedOn === null).count()) throw new Error('This commitment already has an unfinished sitting. Keep that one available before reopening another.');
    const resumed = await db.lifeActivities.where('sittingId').equals(current.id).first();
    if (resumed && (resumed.day < fields.startedOn || fields.finishedOn && resumed.day > fields.finishedOn)) throw new Error('The resumed-study date falls outside these dates. Correct or remove that activity record first.');
    await db.sittings.put({ ...current, step, stopWhen, startedOn: fields.startedOn, finishedOn: fields.finishedOn, updatedAt: new Date().toISOString(), revision: current.revision + 1 });
  });
}
export async function saveActivity(db: AppDatabase, fields: Pick<LifeActivity, 'kind' | 'day' | 'note'>, original?: LifeActivity): Promise<void> {
  if (!Object.hasOwn(activityLabels, fields.kind)) throw new Error('Choose an activity.');
  pastDay(fields.day); const note = singleLine(fields.note, 240, false);
  await db.transaction('rw', db.lifeActivities, db.sittings, db.preferences, async () => {
    const old = original ? await db.lifeActivities.get(original.id) : undefined;
    if (original && old?.revision !== original.revision) throw changed();
    if (fields.kind === 'faith' && !(await db.preferences.get('preferences'))?.faithEnabled) throw new Error('Faith logging is off. You can choose to enable it in Settings.');
    if (old?.sittingId) {
      const sitting = await db.sittings.get(old.sittingId);
      if (!sitting || fields.kind !== 'study-resumed' || fields.day < sitting.startedOn || sitting.finishedOn && fields.day > sitting.finishedOn) throw new Error('Keep a linked study resumption within its sitting’s dates.');
    }
    const now = new Date().toISOString();
    await db.lifeActivities.put({ id: old?.id ?? crypto.randomUUID(), kind: fields.kind, day: fields.day, note, sittingId: old?.sittingId ?? null, reportedAt: old?.reportedAt ?? now, updatedAt: now, revision: (old?.revision ?? -1) + 1 });
  });
}
export async function deleteActivity(db: AppDatabase, activity: LifeActivity) {
  await db.transaction('rw', db.lifeActivities, async () => { if ((await db.lifeActivities.get(activity.id))?.revision !== activity.revision) throw changed(); await db.lifeActivities.delete(activity.id); });
}
export async function deleteSitting(db: AppDatabase, sitting: Sitting) {
  await db.transaction('rw', db.sittings, db.lifeActivities, async () => {
    if ((await db.sittings.get(sitting.id))?.revision !== sitting.revision) throw changed();
    await db.lifeActivities.where('sittingId').equals(sitting.id).delete(); await db.sittings.delete(sitting.id);
  });
}
export async function deleteCommitment(db: AppDatabase, commitment: Commitment) {
  await db.transaction('rw', db.commitments, db.sittings, db.lifeActivities, db.becomingProfile, async () => {
    if ((await db.commitments.get(commitment.id))?.revision !== commitment.revision) throw changed();
    const sittings = await db.sittings.where('commitmentId').equals(commitment.id).toArray();
    for (const sitting of sittings) await db.lifeActivities.where('sittingId').equals(sitting.id).delete();
    await db.sittings.where('commitmentId').equals(commitment.id).delete(); await db.commitments.delete(commitment.id);
    const p = await db.becomingProfile.get('becoming') ?? becomingDefaults;
    if (p.protectedId === commitment.id) await db.becomingProfile.put({ ...p, protectedId: null, revision: p.revision + 1 });
  });
}

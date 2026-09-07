import { expect, test } from 'vitest';
import Dexie from 'dexie';
import { AppDatabase, changePreferences, initializeStorage } from '../../src/storage';
import { becomingCounts, becomingDefaults, protectedCommitment } from '../../src/becomingTypes';
import { chooseProtected, deleteActivity, deleteCommitment, deleteSitting, resumeStudy, saveActivity, saveCommitment, saveDirection, saveSitting, setPlanning, startSitting, today } from '../../src/becomingData';
import { becomingBackup, becomingCsv, parseBecomingBackup, restoreBecoming } from '../../src/becomingBackup';
import { shiftDay } from '../../src/mirror';

const fields = { title: 'A chosen course', nextStep: 'Read one practice question', stopWhen: 'One answer is written', isStudy: true };
async function withDb(fn: (db: AppDatabase) => Promise<void>) { const db = new AppDatabase(`becoming-test-${crypto.randomUUID()}`); try { expect(await initializeStorage(db)).toBe('ready'); await fn(db); } finally { await db.delete(); } }

test('migration from version 3 preserves ordinary, unfinished and private data without invented life records', async () => {
  const name = `migration-test-${crypto.randomUUID()}`, old = new Dexie(name);
  old.version(3).stores({ appMeta: '&key', checkIns: '&id, occurredAt', drafts: '&key', preferences: '&key', privateItems: '&id', privateEntries: '&id, itemId, day, &[day+itemId]' });
  const check = { id: crypto.randomUUID(), occurredAt: new Date().toISOString(), answers: { mood: 2 } }, draft = { key: 'active', answers: { energy: 1 } }, item = { id: crypto.randomUUID(), name: 'Private synthetic item' };
  await old.table('checkIns').put(check); await old.table('drafts').put(draft); await old.table('privateItems').put(item); old.close();
  const db = new AppDatabase(name);
  try { expect(await initializeStorage(db)).toBe('ready'); expect(await db.checkIns.get(check.id)).toEqual(check); expect(await db.drafts.get('active')).toEqual(draft); expect(await db.privateItems.get(item.id)).toEqual(item); expect(await db.becomingProfile.get('becoming')).toEqual(becomingDefaults); expect(await db.commitments.count()).toBe(0); expect(await db.sittings.count()).toBe(0); expect(await db.lifeActivities.count()).toBe(0); } finally { await db.delete(); }
});

test('the protected choice survives novelty, low-demand settings, and new low readings', () => withDb(async (db) => {
  const first = await saveCommitment(db, fields), next = await saveCommitment(db, { ...fields, title: 'Another choice' });
  await changePreferences(db, { lowDemand: true });
  const data = await becomingBackup(db);
  expect(protectedCommitment(data)?.id).toBe(first.id);
  expect(protectedCommitment({ ...data, ...{ score: 0, stress: 4 } })?.id).toBe(first.id);
  expect(await db.sittings.count()).toBe(0);
  await chooseProtected(db, next.id); expect(protectedCommitment(await becomingBackup(db))?.id).toBe(next.id);
}));

test('an intentional start is idempotent under concurrent taps and uses a stopping-point snapshot', () => withDb(async (db) => {
  const c = await saveCommitment(db, fields);
  const [a, b] = await Promise.all([startSitting(db, c), startSitting(db, c)]);
  expect(a.id).toBe(b.id); expect(await db.sittings.count()).toBe(1);
  const edited = await saveCommitment(db, { ...fields, nextStep: 'Next chapter' }, c);
  expect((await startSitting(db, edited)).step).toBe(fields.nextStep);
  expect(becomingCounts(await db.sittings.toArray(), [], false)).toMatchObject({ started: 1, finished: 0 });
  await expect(startSitting(db, c)).rejects.toThrow('changed');
}));

test('one sitting contributes at most one resumed-study count, never a finish inferred from silence', () => withDb(async (db) => {
  const c = await saveCommitment(db, fields), s = await startSitting(db, c);
  const [a, b] = await Promise.all([resumeStudy(db, s), resumeStudy(db, s)]);
  expect(a.id).toBe(b.id); expect(a.sittingId).toBe(s.id);
  const result = becomingCounts(await db.sittings.toArray(), await db.lifeActivities.toArray(), true);
  expect(result).toMatchObject({ started: 1, finished: 0, activities: { 'study-resumed': 1 } });
  expect((await db.sittings.get(s.id))?.finishedOn).toBeNull();
  await saveSitting(db, s, { step: s.step, stopWhen: s.stopWhen, startedOn: s.startedOn, finishedOn: today() });
  await expect(resumeStudy(db, s)).rejects.toThrow();
  expect(becomingCounts(await db.sittings.toArray(), await db.lifeActivities.toArray(), true).finished).toBe(1);
}));

test('correction can remove a finish, retains reporting time, and rejects stale writes and invalid date order', () => withDb(async (db) => {
  const c = await saveCommitment(db, fields), s = await startSitting(db, c);
  await saveSitting(db, s, { step: 'Corrected step', stopWhen: s.stopWhen, startedOn: shiftDay(today(), -1), finishedOn: today() });
  const corrected = (await db.sittings.get(s.id))!;
  expect(corrected.reportedAt).toBe(s.reportedAt); expect(corrected.revision).toBe(1);
  await expect(saveSitting(db, s, { ...s, finishedOn: null })).rejects.toThrow('changed');
  await expect(saveSitting(db, corrected, { ...corrected, startedOn: today(), finishedOn: shiftDay(today(), -1) })).rejects.toThrow('on or after');
  await saveSitting(db, corrected, { ...corrected, finishedOn: null });
  expect(becomingCounts(await db.sittings.toArray(), [], true).finished).toBe(0);
}));

test('a study resumption must stay within its corrected sitting dates', () => withDb(async (db) => {
  const c = await saveCommitment(db, fields), s = await startSitting(db, c), a = await resumeStudy(db, s);
  await expect(saveActivity(db, { kind: a.kind, day: shiftDay(today(), -1), note: '' }, a)).rejects.toThrow('within');
  await expect(saveSitting(db, s, { ...s, startedOn: shiftDay(today(), -2), finishedOn: shiftDay(today(), -1) })).rejects.toThrow('outside');
}));

test('ordinary activities add exactly one dated count and faith requires explicit opt-in', () => withDb(async (db) => {
  await saveActivity(db, { kind: 'daughter-time', day: shiftDay(today(), -2), note: 'An unstructured afternoon' });
  await expect(saveActivity(db, { kind: 'faith', day: today(), note: '' })).rejects.toThrow('off');
  await changePreferences(db, { faithEnabled: true }); await saveActivity(db, { kind: 'faith', day: today(), note: '' });
  const a = await db.lifeActivities.toArray();
  expect(becomingCounts([], a, false)).toMatchObject({ activities: { 'daughter-time': 1, faith: 0 }, firstDay: shiftDay(today(), -2), lastDay: shiftDay(today(), -2) });
  expect(becomingCounts([], a, true).activities.faith).toBe(1);
  await expect(saveActivity(db, { kind: 'conversation', day: shiftDay(today(), 1), note: '' })).rejects.toThrow('earlier');
}));

test('direction and planning choices never create work records, and a direction can be removed', () => withDb(async (db) => {
  await setPlanning(db, 'studyEvenings', false); await setPlanning(db, 'churchSaturday', false);
  const p = (await db.becomingProfile.get('becoming'))!;
  await saveDirection(db, 'I return to what I choose.', p);
  await expect(saveDirection(db, 'Older overwrite', p)).rejects.toThrow('changed');
  await saveDirection(db, '', (await db.becomingProfile.get('becoming'))!);
  expect((await db.becomingProfile.get('becoming'))?.direction).toBe('');
  expect(await db.sittings.count()).toBe(0); expect(await db.lifeActivities.count()).toBe(0);
}));

test('deleting a sitting removes only its linked resumption and leaves its protected commitment', () => withDb(async (db) => {
  const c = await saveCommitment(db, fields), s = await startSitting(db, c); await resumeStudy(db, s);
  await saveActivity(db, { kind: 'conversation', day: today(), note: '' });
  await deleteSitting(db, s);
  expect(await db.sittings.count()).toBe(0); expect(await db.lifeActivities.count()).toBe(1);
  expect(protectedCommitment(await becomingBackup(db))?.id).toBe(c.id);
  await deleteActivity(db, (await db.lifeActivities.toArray())[0]); expect(await db.lifeActivities.count()).toBe(0);
}));

test('deleting a protected commitment clears its choice and linked records without promoting another', () => withDb(async (db) => {
  const c = await saveCommitment(db, fields); await saveCommitment(db, { ...fields, title: 'Other commitment' });
  const s = await startSitting(db, c); await resumeStudy(db, s);
  await deleteCommitment(db, c);
  expect(await db.commitments.count()).toBe(1); expect(await db.sittings.count()).toBe(0); expect(await db.lifeActivities.count()).toBe(0);
  expect(protectedCommitment(await becomingBackup(db))).toBeUndefined();
}));

test('Becoming backup round-trip is additive, keeps corrections, restores choices only on request, and rejects private fields', () => withDb(async (db) => {
  const c = await saveCommitment(db, { ...fields, title: '=SUM(1,2)' }), s = await startSitting(db, c); await resumeStudy(db, s);
  await saveDirection(db, 'My chosen direction', (await db.becomingProfile.get('becoming'))!);
  const b = await becomingBackup(db);
  expect(parseBecomingBackup(JSON.stringify(b))).toEqual(b);
  expect(becomingCsv(b)).toContain("'=SUM(1,2)");
  await expect(restoreBecoming(db, { ...b, ...{ privateItems: ['synthetic'] } })).rejects.toThrow('supported');
  await db.table('commitments').update(c.id, { privateName: 'Synthetic hidden field' });
  expect(JSON.stringify(await becomingBackup(db))).not.toContain('Synthetic hidden field');
  await saveCommitment(db, { ...fields, title: 'Corrected title' }, c);
  expect(await restoreBecoming(db, b)).toBe(0); expect((await db.commitments.get(c.id))?.title).toBe('Corrected title');
  await withDb(async (target) => {
    expect(await restoreBecoming(target, b)).toBe(3); expect((await target.becomingProfile.get('becoming'))?.direction).toBe('');
    expect(await restoreBecoming(target, b, true)).toBe(0); expect(protectedCommitment(await becomingBackup(target))?.id).toBe(c.id);
    expect((await target.becomingProfile.get('becoming'))?.direction).toBe('My chosen direction');
  });
}));

test('restore rejects dangling references and conflicting unfinished sittings atomically', () => withDb(async (db) => {
  const c = await saveCommitment(db, fields), s = await startSitting(db, c); await resumeStudy(db, s);
  const b = await becomingBackup(db);
  expect(() => parseBecomingBackup(JSON.stringify({ ...b, commitments: [] }))).toThrow();
  expect(() => parseBecomingBackup(JSON.stringify({ ...b, activities: [{ ...b.activities[0], sittingId: crypto.randomUUID() }] }))).toThrow();
  const copy = { ...b, sittings: [{ ...s, id: crypto.randomUUID() }], activities: [], commitments: [...b.commitments, { ...c, id: crypto.randomUUID(), title: 'Must roll back' }] };
  await expect(restoreBecoming(db, copy)).rejects.toThrow('two unfinished');
  expect(await db.commitments.count()).toBe(1); expect(await db.sittings.count()).toBe(1);
}));

import { describe, expect, test } from 'vitest';
import { coreIds, currentBlock, newDraft, questionsFor, readings, readingIds, score, summarize, type Answers, type CheckIn } from '../../src/readings';
import { AppDatabase, deleteCheckIn, initializeStorage, saveCheckIn, writeDraft } from '../../src/storage';
import { makeBackup, parseBackup, restoreBackup, toCsv } from '../../src/backup';
import Dexie from 'dexie';

function record(answers: Answers, occurredAt = '2026-09-01T12:00:00.000Z'): CheckIn {
  return { id: crypto.randomUUID(), block: 'morning', occurredAt, reportedAt: occurredAt, updatedAt: occurredAt, answers,
    definitionVersion: 1, scoreVersion: 'core-four-v1', answeringMs: 3000 };
}
async function withDb(run: (db: AppDatabase) => Promise<void>) {
  const db = new AppDatabase(`test-${crypto.randomUUID()}`);
  try { await initializeStorage(db); await run(db); } finally { await db.delete(); }
}
test('each reading has five descriptive anchors and the three check-in sets stay distinct', () => {
  expect(questionsFor('morning')).toHaveLength(13);
  expect(questionsFor('afternoon')).toEqual(['mood', 'irritation', 'energy', 'hunger', 'stress']);
  expect(questionsFor('evening')).toEqual(questionsFor('afternoon'));
  for (const item of Object.values(readings)) {
    expect(item.anchors).toHaveLength(5);
    expect(new Set(item.anchors).size).toBe(5);
    expect(item.anchors.every((anchor) => anchor.split(' — ')[1]?.length > 10)).toBe(true);
  }
  expect(currentBlock(new Date(2026, 8, 1, 11))).toBe('morning');
  expect(currentBlock(new Date(2026, 8, 1, 12))).toBe('afternoon');
  expect(currentBlock(new Date(2026, 8, 1, 18))).toBe('evening');
});
test('the fixed score has the right direction and equal contributions, independent of every context item', () => {
  expect(score({ mood: 0, energy: 0, irritation: 4, stress: 4 })).toBe(0);
  expect(score({ mood: 4, energy: 4, irritation: 0, stress: 0 })).toBe(100);
  const middle: Answers = { mood: 2, energy: 2, irritation: 2, stress: 2 };
  for (const id of coreIds) expect(score({ ...middle, [id]: id === 'stress' || id === 'irritation' ? 1 : 3 })).toBe(56.25);
  for (const id of readingIds.filter((id) => !coreIds.includes(id))) {
    expect(score({ ...middle, [id]: 0 })).toBe(50);
    expect(score({ ...middle, [id]: 4 })).toBe(50);
  }
});
test('missing answers never change the denominator or borrow prior ingredients', () => {
  const complete = record({ mood: 4, energy: 4, irritation: 0, stress: 0 });
  for (const id of coreIds) {
    const answers = { ...complete.answers }; delete answers[id];
    expect(score(answers)).toBeNull();
    const next = record(answers, '2026-09-01T18:00:00.000Z');
    expect(summarize(next, [complete, next]).lastComplete).toEqual({ score: 100, at: complete.occurredAt });
    expect(summarize(next, [complete, next]).score).toBeNull();
  }
  expect(score({})).toBeNull();
});
test('comparisons use earlier matching answers, retain context timestamps, and never consult future data', () => {
  const morning = record({ mood: 0, confidence: 1, sleepDuration: 3 });
  const afternoon = record({ energy: 1 }, '2026-09-01T18:00:00.000Z');
  const evening = record({ mood: 2, energy: 1 }, '2026-09-02T01:00:00.000Z');
  const future = record({ mood: 4, confidence: 4 }, '2026-09-03T01:00:00.000Z');
  const summary = summarize(evening, [future, evening, afternoon, morning]);
  expect(summary.comparisons).toEqual([
    { id: 'mood', current: 2, previous: 0, previousAt: morning.occurredAt, delta: 50 },
    { id: 'energy', current: 1, previous: 1, previousAt: afternoon.occurredAt, delta: 0 },
  ]);
  expect(summary.context).toContainEqual({ id: 'sleepDuration', value: 3, at: morning.occurredAt });
  expect(summary.context).toContainEqual({ id: 'confidence', value: 1, at: morning.occurredAt });
});
test('migrates the Phase 0 database without inventing records', async () => {
  const name = `migration-${crypto.randomUUID()}`;
  const old = new Dexie(name); old.version(1).stores({ appMeta: '&key' });
  await old.table('appMeta').put({ key: 'schema-version', value: 1 }); old.close();
  const db = new AppDatabase(name);
  try {
    expect(await initializeStorage(db)).toBe('ready');
    expect(await db.checkIns.count()).toBe(0);
    expect(await db.drafts.count()).toBe(0);
    expect((await db.appMeta.get('schema-version'))?.value).toBe(3);
  } finally { await db.delete(); }
});
test('an interrupted draft survives reopening; commit is atomic and corrections retain reporting time', async () => withDb(async (db) => {
  const draft = { ...newDraft('morning'), answers: { mood: 2 as const }, index: 1, answeringMs: 1200 };
  await writeDraft(db, draft, null);
  db.close(); await db.open();
  expect(await db.drafts.get('active')).toEqual(draft);
  const saved = await saveCheckIn(db, draft);
  expect(saved?.answers).toEqual({ mood: 2 });
  expect(await db.drafts.count()).toBe(0);
  expect(await db.checkIns.count()).toBe(1);
  const edit = { ...newDraft('morning', saved!), answers: { mood: 4 as const } };
  await writeDraft(db, edit, null); const corrected = await saveCheckIn(db, edit);
  expect(corrected?.id).toBe(saved?.id);
  expect(corrected?.reportedAt).toBe(saved?.reportedAt);
  expect(corrected?.answeringMs).toBe(1200);
  expect(corrected?.answers).toEqual({ mood: 4 });
  expect(await db.checkIns.count()).toBe(1);
}));
test('empty drafts and stale tabs cannot silently create or overwrite observations', async () => withDb(async (db) => {
  const draft = newDraft('evening'); await writeDraft(db, draft, null);
  expect(await saveCheckIn(db, draft)).toBeNull();
  expect(await db.checkIns.count()).toBe(0);
  await writeDraft(db, { ...draft, revision: 1, answers: { mood: 0 } }, 0);
  await expect(writeDraft(db, { ...draft, revision: 1, answers: { mood: 4 } }, 0)).rejects.toThrow('changed');
  await expect(saveCheckIn(db, draft)).rejects.toThrow('changed');
  expect((await db.drafts.get('active'))?.answers).toEqual({ mood: 0 });
}));
test('deletion removes its edit draft and recalculations have no stale record to consult', async () => withDb(async (db) => {
  const first = record({ mood: 0 }); const next = record({ mood: 4 }, '2026-09-01T18:00:00.000Z');
  await db.checkIns.bulkAdd([first, next]); await writeDraft(db, newDraft('morning', first), null);
  await deleteCheckIn(db, first.id);
  expect(await db.drafts.count()).toBe(0);
  expect(summarize(next, await db.checkIns.toArray()).comparisons).toEqual([]);
}));
test('JSON round-trips saved data and unfinished work; CSV preserves phrase ranges and empty answers', async () => withDb(async (db) => {
  const original = record({ mood: 0, sleepDuration: 3 }); const draft = { ...newDraft('evening'), answers: { hunger: 4 as const }, index: 4 };
  const backup = parseBackup(JSON.stringify(makeBackup([original], draft)));
  expect(await restoreBackup(db, backup)).toEqual({ added: 1, kept: 0, draftRestored: true });
  expect(await db.checkIns.toArray()).toEqual([original]);
  expect(await db.drafts.get('active')).toEqual(draft);
  const csv = toCsv(backup);
  expect(csv).toContain('A long stretch — 7 to under 9 hours');
  expect(csv).toContain('"irritation","Not logged yet",""');
  expect(csv).toContain('"draft"');
}));
test('restore keeps newer corrections, is idempotent, and never resurrects a completed draft as an overwrite', async () => withDb(async (db) => {
  const original = record({ mood: 1 });
  const corrected = { ...original, answers: { mood: 4 as const }, updatedAt: '2026-09-02T12:00:00.000Z' };
  await db.checkIns.add(corrected);
  const backup = makeBackup([original], { ...newDraft('morning'), id: original.id, answers: { mood: 1 } });
  expect(await restoreBackup(db, backup)).toEqual({ added: 0, kept: 1, draftRestored: false });
  expect(await db.checkIns.get(original.id)).toEqual(corrected);
  expect(await db.drafts.count()).toBe(0);
  await writeDraft(db, backup.draft!, null);
  await expect(saveCheckIn(db, backup.draft!)).rejects.toThrow('already saved');
}));
test('invalid, unsupported, or duplicate backup records cannot partially restore', async () => withDb(async (db) => {
  const backup = makeBackup([record({ mood: 2 })], null);
  for (const bad of [ { ...backup, schemaVersion: 99 }, { ...backup, checkIns: [...backup.checkIns, ...backup.checkIns] },
    { ...backup, checkIns: [backup.checkIns[0], { ...record({ mood: 2 }), answers: { mood: 5 } }] },
    { ...backup, checkIns: [{ ...backup.checkIns[0], occurredAt: 'not a date' }] } ]) {
    await expect(restoreBackup(db, bad as typeof backup)).rejects.toThrow();
    expect(await db.checkIns.count()).toBe(0);
  }
}));
test('ordinary exports are allowlisted and do not serialize unexpected private fields', () => {
  const item = { ...record({ mood: 2 }), privateNotes: 'sensitive-fixture', answers: { mood: 2 as const, futurePrivate: 'sensitive-fixture' } };
  const backup = makeBackup([item], null);
  expect(JSON.stringify(backup)).not.toContain('sensitive-fixture');
  expect(toCsv(backup)).not.toContain('sensitive-fixture');
  expect(() => parseBackup(JSON.stringify({ ...backup, privateNotes: 'sensitive-fixture' }))).toThrow();
});

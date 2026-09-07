import { expect, test } from 'vitest';
import Dexie from 'dexie';
import { AppDatabase, changePreferences, deleteCheckIn, initializeStorage, saveCheckIn, writeDraft } from '../../src/storage';
import { defaults, effectiveDepth, inQuietHours, alarmPlan, plannedBlocks, preferredBlock } from '../../src/preferences';
import { newDraft, questionsFor, score } from '../../src/readings';
import { makeBackup, parseBackup, restoreBackup, toCsv } from '../../src/backup';
import { deletePrivateItem, parsePrivateBackup, privateBackup, privateCsv, restorePrivate, savePrivateItem, setPrivateEntry } from '../../src/privateData';

async function dbTest(fn: (db: AppDatabase) => Promise<void>) { const db = new AppDatabase(`phase2-${crypto.randomUUID()}`); try { await initializeStorage(db); await fn(db); } finally { await db.delete(); } }
test('low-demand overrides depth and frequency without rewriting either, and respects quiet hours', () => {
  const usual = { ...structuredClone(defaults), depth: 'standard' as const, frequency: 2 as const };
  const light = { ...usual, lowDemand: true };
  expect(effectiveDepth(light)).toBe('brief'); expect(plannedBlocks(light)).toEqual(['evening']);
  expect(light.depth).toBe('standard'); expect(light.frequency).toBe(2);
  expect(plannedBlocks({ ...light, lowDemand: false })).toEqual(['morning','evening']);
  expect(questionsFor('morning', effectiveDepth(light))).toHaveLength(5);
  expect(preferredBlock(light, new Date(2026,8,7,9))).toBe('evening');
  expect(alarmPlan({ ...light, quietStart: '20:00' })).toEqual([]);
  expect(plannedBlocks({ ...usual, frequency: 0 })).toEqual([]);
});
test('quiet windows include their start, exclude their end, work across midnight, and never move alarm times', () => {
  for (const time of ['22:00','00:00','06:59']) expect(inQuietHours(time, defaults)).toBe(true);
  for (const time of ['07:00','21:59']) expect(inQuietHours(time, defaults)).toBe(false);
  const p = { ...defaults, quietStart: '12:00', quietEnd: '15:00' };
  expect(alarmPlan(p)).toEqual([{ block: 'morning', time: '08:00' },{ block: 'evening', time: '21:00' }]);
  expect(inQuietHours('12:00', { ...p, quietEnd: '12:00' })).toBe(false);
});
test('Phase 1 database and version 1 backup migrate without adding evening or private observations', async () => {
  const name = `old-${crypto.randomUUID()}`; const old = new Dexie(name);
  old.version(2).stores({ appMeta: '&key', checkIns: '&id, occurredAt', drafts: '&key' });
  const r = { id: crypto.randomUUID(), block: 'morning', occurredAt: '2026-09-01T12:00:00.000Z', reportedAt: '2026-09-01T12:01:00.000Z', updatedAt: '2026-09-01T12:01:00.000Z', answers: { mood: 2 }, definitionVersion: 1, scoreVersion: 'core-four-v1', answeringMs: 1200 };
  await old.table('checkIns').add(r); old.close(); const db = new AppDatabase(name);
  try {
    await initializeStorage(db); expect(await db.checkIns.get(r.id)).toEqual(r);
    expect(await db.privateEntries.count()).toBe(0); expect(await db.privateItems.count()).toBe(0);
    expect(await db.preferences.get('preferences')).toEqual(defaults);
    const legacy = parseBackup(JSON.stringify({ format: 'tyree-life-compass', schemaVersion: 1, exportedAt: r.updatedAt, checkIns: [r], draft: null }));
    expect((await restoreBackup(db, legacy)).kept).toBe(1);
  } finally { await db.delete(); }
});
test('explicit no is retained, skips stay absent, and evening extras never contribute to the fixed score', async () => dbTest(async (db) => {
  const draft = { ...newDraft('evening'), answers: { mood: 2 as const, energy: 2 as const, irritation: 2 as const, stress: 2 as const }, evening: { minimumWin: 'A small test note', caffeineAfterMidday: false, closeToGod: true } };
  await writeDraft(db, draft, null); const record = (await saveCheckIn(db, draft))!;
  expect(record.evening).toEqual(draft.evening); expect(record.evening).not.toHaveProperty('lateDinner'); expect(score(record.answers)).toBe(50);
  const b = makeBackup([record], null); expect(parseBackup(JSON.stringify(b)).checkIns[0]).toEqual(record);
  expect(toCsv(b)).toContain('"caffeineAfterMidday","No",""'); expect(toCsv(b)).not.toContain('"lateDinner"');
  const edit = { ...newDraft('evening', record), evening: {} }; await writeDraft(db, edit, null);
  expect((await saveCheckIn(db, edit))?.evening).toEqual({});
  await deleteCheckIn(db, record.id); expect(await db.checkIns.count()).toBe(0);
}));
test('a note-only evening is saved without inventing state, and an open draft keeps its chosen depth', async () => dbTest(async (db) => {
  const brief = newDraft('morning', undefined, 'brief'); await writeDraft(db, brief, null);
  await changePreferences(db, { depth: 'standard', lowDemand: true });
  expect((await db.drafts.get('active'))?.depth).toBe('brief');
  await db.drafts.clear();
  const note = { ...newDraft('evening'), evening: { minimumWin: 'One test note' } }; await writeDraft(db, note, null);
  const saved = (await saveCheckIn(db, note))!; expect(saved.answers).toEqual({}); expect(score(saved.answers)).toBeNull();
}));
test('private absence differs from missingness, clearing and deleting remove entries, and disabled logging cannot write', async () => dbTest(async (db) => {
  await expect(savePrivateItem(db, 'Test item')).rejects.toThrow('off');
  await changePreferences(db, { privateEnabled: true }); await savePrivateItem(db, 'Test item'); const item = (await db.privateItems.toArray())[0];
  expect(await db.privateEntries.count()).toBe(0);
  await setPrivateEntry(db, item.id, '2026-09-07', false); let entry = (await db.privateEntries.toArray())[0];
  expect(entry.occurred).toBe(false); expect(entry).not.toHaveProperty('occurredAt');
  await setPrivateEntry(db, item.id, '2026-09-07', true); expect((await db.privateEntries.toArray())[0].reportedAt).toBe(entry.reportedAt);
  await changePreferences(db, { privateEnabled: false }); await expect(setPrivateEntry(db, item.id, '2026-09-07', false)).rejects.toThrow('off');
  expect((await db.privateEntries.toArray())[0].occurred).toBe(true);
  await changePreferences(db, { privateEnabled: true }); await setPrivateEntry(db, item.id, '2026-09-07', undefined); expect(await db.privateEntries.count()).toBe(0);
  await setPrivateEntry(db, item.id, '2026-09-07', false); await deletePrivateItem(db, item.id); expect(await db.privateEntries.count()).toBe(0);
}));
test('ordinary export has no private values or enable flag, while explicit private export restores independently', async () => dbTest(async (db) => {
  await changePreferences(db, { privateEnabled: true }); await savePrivateItem(db, 'Test-only private label'); const item = (await db.privateItems.toArray())[0];
  await setPrivateEntry(db, item.id, '2026-09-07', true);
  const b = makeBackup([], null, new Date().toISOString(), (await db.preferences.get('preferences'))!);
  expect(JSON.stringify(b)).not.toMatch(/private|Test-only/); expect(toCsv(b)).not.toContain('Test-only');
  const secret = parsePrivateBackup(JSON.stringify(await privateBackup(db))); await deletePrivateItem(db, item.id);
  await changePreferences(db, { privateEnabled: false }); expect(await restorePrivate(db, secret)).toBe(1);
  expect((await db.preferences.get('preferences'))?.privateEnabled).toBe(false);
  expect(await restorePrivate(db, secret)).toBe(0); expect(await db.privateEntries.count()).toBe(1);
}));
test('private restore rejects orphaned entries atomically and spreadsheet exports neutralize formula text', async () => dbTest(async (db) => {
  await changePreferences(db, { privateEnabled: true }); await savePrivateItem(db, '=TEST()'); const i = (await db.privateItems.toArray())[0];
  await setPrivateEntry(db, i.id, '2026-09-07', false); const b = await privateBackup(db);
  expect(privateCsv(b)).toContain("'=TEST()");
  expect(() => parsePrivateBackup(JSON.stringify({ ...b, items: [] }))).toThrow();
  expect(() => parsePrivateBackup(JSON.stringify({ ...b, entries: [...b.entries, ...b.entries] }))).toThrow();
  const note = { ...newDraft('evening'), answers: {}, evening: { minimumWin: '=TEST()' } }; await writeDraft(db, note, null); const record = (await saveCheckIn(db, note))!;
  expect(toCsv(makeBackup([record], null))).toContain("'=" + 'TEST()');
}));
test('restoring ordinary settings is opt-in and cannot enable private logging', async () => dbTest(async (db) => {
  const b = makeBackup([], null, new Date().toISOString(), { ...defaults, privateEnabled: true, depth: 'brief', frequency: 1 });
  await restoreBackup(db, b); expect((await db.preferences.get('preferences'))?.depth).toBe('standard');
  await restoreBackup(db, b, true); const p = await db.preferences.get('preferences'); expect(p?.depth).toBe('brief'); expect(p?.privateEnabled).toBe(false);
  expect(() => parseBackup(JSON.stringify({ ...b, settings: { ...b.settings, privateEnabled: true } }))).toThrow();
}));

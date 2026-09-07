import { expect, test } from 'vitest';
import { AppDatabase, initializeStorage, requestPersistence } from '../../src/storage';

test('creates only versioned system metadata and survives reopening without personal observations', async () => {
  const name = `compass-test-${crypto.randomUUID()}`;
  const database = new AppDatabase(name);
  expect(await initializeStorage(database)).toBe('ready');
  expect(await database.appMeta.toArray()).toEqual([{ key: 'schema-version', value: 4 }]);
  expect(await database.checkIns.count()).toBe(0);
  expect(await database.drafts.count()).toBe(0);
  database.close();
  const reopened = new AppDatabase(name);
  expect(await initializeStorage(reopened)).toBe('ready');
  expect(await reopened.appMeta.count()).toBe(1);
  await reopened.delete();
});

test('does not promise persistence when the browser declines, lacks support, or errors', async () => {
  expect(await requestPersistence(undefined)).toBe(false);
  expect(await requestPersistence({ persist: async () => false })).toBe(false);
  expect(await requestPersistence({ persist: async () => { throw new Error('unavailable'); } })).toBe(false);
  expect(await requestPersistence({ persist: async () => true })).toBe(true);
});

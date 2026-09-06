import Dexie, { type EntityTable } from 'dexie';

type AppMetadata = { key: string; value: number };
export class AppDatabase extends Dexie {
  appMeta!: EntityTable<AppMetadata, 'key'>;

  constructor(name = 'tyree-life-compass') {
    super(name);
    this.version(1).stores({ appMeta: '&key' });
  }
}

export async function initializeStorage(database: AppDatabase): Promise<'ready' | 'unavailable'> {
  try {
    await database.open();
    await database.transaction('rw', database.appMeta, async () => {
      await database.appMeta.put({ key: 'schema-version', value: 1 });
    });
    return 'ready';
  } catch {
    return 'unavailable';
  }
}

export async function requestPersistence(storage?: Pick<StorageManager, 'persist'>): Promise<boolean> {
  try { return storage?.persist ? await storage.persist() : false; }
  catch { return false; }
}

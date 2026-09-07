import Dexie, { type EntityTable } from 'dexie';
import { definitionVersion, scoreVersion, type CheckIn, type Draft } from './readings';
import { defaults, type Preferences } from './preferences';
import type { PrivateItem, PrivateEntry } from './privateData';

type AppMetadata = { key: string; value: number };
export class AppDatabase extends Dexie {
  appMeta!: EntityTable<AppMetadata, 'key'>;
  checkIns!: EntityTable<CheckIn, 'id'>;
  drafts!: EntityTable<Draft, 'key'>;
  preferences!: EntityTable<Preferences, 'key'>;
  privateItems!: EntityTable<PrivateItem, 'id'>;
  privateEntries!: EntityTable<PrivateEntry, 'id'>;
  constructor(name = 'tyree-life-compass') {
    super(name);
    this.version(1).stores({ appMeta: '&key' });
    this.version(2).stores({ appMeta: '&key', checkIns: '&id, occurredAt', drafts: '&key' });
    this.version(3).stores({ appMeta: '&key', checkIns: '&id, occurredAt', drafts: '&key', preferences: '&key', privateItems: '&id', privateEntries: '&id, itemId, day, &[day+itemId]' });
  }
}
export async function initializeStorage(database: AppDatabase): Promise<'ready' | 'unavailable'> {
  try {
    await database.open();
    await database.transaction('rw', database.appMeta, database.preferences, async () => {
      await database.appMeta.put({ key: 'schema-version', value: 3 });
      if (!await database.preferences.get('preferences')) await database.preferences.add(structuredClone(defaults));
    });
    return 'ready';
  } catch { return 'unavailable'; }
}
export async function requestPersistence(storage?: Pick<StorageManager, 'persist'>): Promise<boolean> {
  try { return storage?.persist ? await storage.persist() : false; }
  catch { return false; }
}
export async function writeDraft(database: AppDatabase, draft: Draft, expectedRevision: number | null): Promise<void> {
  await database.transaction('rw', database.drafts, async () => {
    const existing = await database.drafts.get('active');
    if (expectedRevision === null ? Boolean(existing) : !existing || existing.id !== draft.id || existing.revision !== expectedRevision) {
      throw new Error('This draft changed in another tab. Return to Today to open its latest version.');
    }
    await database.drafts.put(draft);
  });
}
export async function saveCheckIn(database: AppDatabase, draft: Draft): Promise<CheckIn | null> {
  return database.transaction('rw', database.checkIns, database.drafts, async () => {
    const stored = await database.drafts.get('active');
    if (!stored || stored.id !== draft.id || stored.revision !== draft.revision) throw new Error('This draft changed. Return to Today to reopen it.');
    if (Object.keys(draft.answers).length === 0 && !Object.keys(draft.evening ?? {}).length) return null;
    const now = new Date().toISOString();
    const original = draft.editingId ? await database.checkIns.get(draft.editingId) : null;
    if (!draft.editingId && await database.checkIns.get(draft.id)) throw new Error('This draft was already saved elsewhere. Discard it and open the saved reading.');
    if (draft.editingId && (!original || original.updatedAt !== draft.editingUpdatedAt)) throw new Error('This reading changed elsewhere. Discard this draft and reopen the saved reading.');
    const record: CheckIn = { id: original?.id ?? draft.id, block: draft.block, occurredAt: draft.occurredAt,
      reportedAt: original?.reportedAt ?? now, updatedAt: now, answers: { ...draft.answers },
      definitionVersion, scoreVersion, answeringMs: original?.answeringMs ?? draft.answeringMs,
      depth: draft.depth ?? 'standard', evening: { ...draft.evening } };
    await database.checkIns.put(record);
    await database.drafts.delete('active');
    return record;
  });
}
export async function changePreferences(database: AppDatabase, patch: Partial<Preferences>) {
  await database.transaction('rw', database.preferences, async () => {
    const previous = await database.preferences.get('preferences') ?? structuredClone(defaults);
    await database.preferences.put({ ...previous, ...patch, key: 'preferences' });
  });
}
export async function deleteCheckIn(database: AppDatabase, id: string): Promise<void> {
  await database.transaction('rw', database.checkIns, database.drafts, async () => {
    await database.checkIns.delete(id);
    const draft = await database.drafts.get('active');
    if (draft?.editingId === id) await database.drafts.delete('active');
  });
}
export async function discardDraft(database: AppDatabase, id: string): Promise<void> {
  await database.transaction('rw', database.drafts, async () => {
    if ((await database.drafts.get('active'))?.id !== id) throw new Error('The draft changed in another tab. Reopen Today.');
    await database.drafts.delete('active');
  });
}

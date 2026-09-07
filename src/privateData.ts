import type { AppDatabase } from './storage';
export type PrivateItem = { id: string; name: string; createdAt: string; updatedAt: string };
export type PrivateEntry = { id: string; itemId: string; day: string; occurred: boolean; reportedAt: string; updatedAt: string };
export type PrivateBackup = { format: 'life-compass-private'; schemaVersion: 1; exportedAt: string; items: PrivateItem[]; entries: PrivateEntry[] };
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const timestamp = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
export const validDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
function exact(value: unknown, keys: string[]): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.keys(value!).length === keys.length && Object.keys(value!).every((key) => keys.includes(key)); }
export function parsePrivateBackup(text: string): PrivateBackup {
  const invalid = () => new Error('This is not a supported private backup. Nothing was changed.');
  if (text.length > 20_000_000) throw invalid();
  let b: unknown; try { b = JSON.parse(text); } catch { throw invalid(); }
  if (!exact(b, ['format', 'schemaVersion', 'exportedAt', 'items', 'entries']) || b.format !== 'life-compass-private' || b.schemaVersion !== 1 || !timestamp(b.exportedAt) || !Array.isArray(b.items) || !Array.isArray(b.entries) || b.items.length > 1000 || b.entries.length > 100000) throw invalid();
  const ids = new Set<string>();
  for (const item of b.items) {
    if (!exact(item, ['id', 'name', 'createdAt', 'updatedAt']) || !uuid(item.id) || ids.has(item.id as string) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80 || !timestamp(item.createdAt) || !timestamp(item.updatedAt)) throw invalid();
    ids.add(item.id as string);
  }
  const pairs = new Set<string>(); const entries = new Set<string>();
  for (const entry of b.entries) {
    if (!exact(entry, ['id', 'itemId', 'day', 'occurred', 'reportedAt', 'updatedAt']) || !uuid(entry.id) || entries.has(entry.id as string) || !ids.has(entry.itemId as string) || !validDay(entry.day) || typeof entry.occurred !== 'boolean' || !timestamp(entry.reportedAt) || !timestamp(entry.updatedAt)) throw invalid();
    const pair = `${entry.day}:${entry.itemId}`; if (pairs.has(pair)) throw invalid(); pairs.add(pair); entries.add(entry.id as string);
  }
  return b as PrivateBackup;
}
export async function setPrivateEntry(db: AppDatabase, itemId: string, day: string, occurred: boolean | undefined) {
  if (!validDay(day)) throw new Error('Choose a valid day.');
  await db.transaction('rw', db.preferences, db.privateItems, db.privateEntries, async () => {
    if (!(await db.preferences.get('preferences'))?.privateEnabled || !await db.privateItems.get(itemId)) throw new Error('Private logging is off or the item changed.');
    const existing = await db.privateEntries.where('[day+itemId]').equals([day, itemId]).first();
    if (occurred === undefined) { if (existing) await db.privateEntries.delete(existing.id); return; }
    const now = new Date().toISOString();
    await db.privateEntries.put({ id: existing?.id ?? crypto.randomUUID(), itemId, day, occurred, reportedAt: existing?.reportedAt ?? now, updatedAt: now });
  });
}
export async function savePrivateItem(db: AppDatabase, name: string, id?: string) {
  name = name.trim(); if (!name || name.length > 80) throw new Error('Use a name between 1 and 80 characters.');
  await db.transaction('rw', db.preferences, db.privateItems, async () => {
    if (!(await db.preferences.get('preferences'))?.privateEnabled) throw new Error('Private logging is off.');
    const old = id ? await db.privateItems.get(id) : null;
    if (id && !old) throw new Error('This item was removed.');
    const now = new Date().toISOString();
    await db.privateItems.put({ id: old?.id ?? crypto.randomUUID(), name, createdAt: old?.createdAt ?? now, updatedAt: now });
  });
}
export async function deletePrivateItem(db: AppDatabase, id: string) {
  await db.transaction('rw', db.privateItems, db.privateEntries, async () => { await db.privateEntries.where('itemId').equals(id).delete(); await db.privateItems.delete(id); });
}
export async function privateBackup(db: AppDatabase): Promise<PrivateBackup> {
  return db.transaction('r', db.privateItems, db.privateEntries, async () => ({ format: 'life-compass-private', schemaVersion: 1, exportedAt: new Date().toISOString(), items: await db.privateItems.toArray(), entries: await db.privateEntries.toArray() }));
}
export async function restorePrivate(db: AppDatabase, input: PrivateBackup) {
  const b = parsePrivateBackup(JSON.stringify(input));
  return db.transaction('rw', db.privateItems, db.privateEntries, async () => {
    for (const item of b.items) if (!await db.privateItems.get(item.id)) await db.privateItems.add(item);
    let added = 0;
    for (const entry of b.entries) if (!await db.privateEntries.get(entry.id) && !await db.privateEntries.where('[day+itemId]').equals([entry.day, entry.itemId]).first()) { await db.privateEntries.add(entry); added++; }
    return added;
  });
}
// A quoted cell alone does not prevent spreadsheet formula interpretation.
export function csvCell(value: string | number | boolean) { let text = String(value); if (/^[\s]*[=+\-@\t\r\n]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; }
export function privateCsv(b: PrivateBackup) {
  const rows: (string | boolean)[][] = [['record_type', 'id', 'item_id', 'name', 'day', 'occurred', 'reported_at', 'updated_at']];
  for (const i of b.items) rows.push(['item', i.id, i.id, i.name, '', '', i.createdAt, i.updatedAt]);
  for (const e of b.entries) rows.push(['entry', e.id, e.itemId, b.items.find((i) => i.id === e.itemId)!.name, e.day, e.occurred, e.reportedAt, e.updatedAt]);
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

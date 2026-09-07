import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { type AppDatabase } from './storage';
import { deletePrivateItem, parsePrivateBackup, privateBackup, privateCsv, restorePrivate, savePrivateItem, setPrivateEntry, type PrivateBackup, type PrivateEntry, type PrivateItem } from './privateData';
import { localDay } from './preferences';
import { download } from './DataPanel';
import { ChoiceChips } from './EveningExtras';

function usePrivate(db: AppDatabase, day: string) {
  const [data, setData] = useState<{ items: PrivateItem[]; entries: PrivateEntry[]; error: boolean }>({ items: [], entries: [], error: false });
  useEffect(() => {
    setData({ items: [], entries: [], error: false });
    const sub = liveQuery(() => db.transaction('r', db.privateItems, db.privateEntries, async () => ({ items: await db.privateItems.toArray(), entries: await db.privateEntries.where('day').equals(day).toArray() }))).subscribe({ next: (r) => setData({ ...r, error: false }), error: () => setData({ items: [], entries: [], error: true }) });
    return () => sub.unsubscribe();
  }, [db, day]);
  return data;
}
export function PrivateLog({ database, day }: { database: AppDatabase; day: string }) {
  const data = usePrivate(database, day); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  async function change(itemId: string, value: boolean | undefined) {
    setBusy(true); setMessage('');
    try { await setPrivateEntry(database, itemId, day, value); setMessage(value === undefined ? 'Entry removed. This day is not logged for that item.' : 'Private entry saved on this device.'); }
    catch { setMessage('Could not save this entry. Reopen settings and try again.'); }
    finally { setBusy(false); }
  }
  return <section className="optional-section" aria-label="Private log">
    <h2>Private log</h2><p className="secondary">For {day}. Each tap saves separately from this check-in. A day is recorded, never an exact occurrence time.</p>
    {data.error ? <p role="alert">Private entries are unavailable.</p> : data.items.length ? data.items.map((item) => <ChoiceChips key={item.id} label={item.name} value={data.entries.find((e) => e.itemId === item.id)?.occurred} onChange={(value) => void change(item.id, value)} disabled={busy} yes="Happened" no="Did not happen" />) : <p className="secondary">Name your own items in Settings when you choose.</p>}
    {message && <p className="secondary" role="status">{message}</p>}
  </section>;
}
export function PrivateSettings({ database }: { database: AppDatabase }) {
  const [day, setDay] = useState(localDay()); const data = usePrivate(database, day);
  const [name, setName] = useState(''); const [editingId, setEditingId] = useState<string | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''); const [backup, setBackup] = useState<PrivateBackup | null>(null);
  async function perform(fn: () => Promise<void>, success: string) { setBusy(true); setMessage(''); try { await fn(); setMessage(success); } catch { setMessage('Could not complete this step. Nothing new was saved.'); } finally { setBusy(false); } }
  async function exportFile(csv: boolean) { await perform(async () => { const b = await privateBackup(database); download(csv ? privateCsv(b) : JSON.stringify(b, null, 2), csv ? 'text/csv;charset=utf-8' : 'application/json', csv ? 'csv' : 'json', 'life-compass-private'); }, 'Private export prepared. Keep this file somewhere you control.'); }
  async function read(file?: File) {
    setBackup(null); setMessage(''); if (!file) return;
    if (file.size > 20_000_000) { setMessage('This file is too large. Nothing was changed.'); return; }
    try { setBackup(parsePrivateBackup(await file.text())); } catch { setMessage('This is not a supported private backup. Nothing was changed.'); }
  }
  return <div className="private-settings">
    <p className="secondary">Names and entries stay off ordinary screens and exports when hidden. This is a visibility control, not a password lock. Nothing here changes your score or claims an effect.</p>
    <form onSubmit={(event) => { event.preventDefault(); void perform(async () => { await savePrivateItem(database, name, editingId); setName(''); setEditingId(undefined); }, 'Item saved.'); }}>
      <label className="file-label" htmlFor="private-name">{editingId ? 'Edit item name' : 'Name a private item'}</label><input id="private-name" value={name} maxLength={80} autoComplete="off" onChange={(event) => setName(event.target.value)} />
      <div className="record-actions"><button className="secondary-button" disabled={busy || !name.trim()}>{editingId ? 'Save name' : 'Add item'}</button>{editingId && <button type="button" className="text-button" onClick={() => { setEditingId(undefined); setName(''); }}>Cancel name edit</button>}</div>
    </form>
    {data.items.map((item) => <div className="private-item" key={item.id}><span>{item.name}</span><div className="record-actions"><button className="text-button" disabled={busy} onClick={() => { setName(item.name); setEditingId(item.id); }}>Edit name</button><button className="text-button" disabled={busy} onClick={() => setDeletingId(item.id)}>Delete item</button></div>{deletingId === item.id && <div className="confirm-box"><p>Delete this item and all its entries from this device? Existing export files keep their copies.</p><div className="record-actions"><button className="secondary-button" disabled={busy} onClick={() => void perform(async () => { await deletePrivateItem(database, item.id); setDeletingId(null); if (editingId === item.id) { setEditingId(undefined); setName(''); } }, 'Item and entries deleted.')}>Delete item and entries</button><button className="text-button" onClick={() => setDeletingId(null)}>Keep item</button></div></div>}</div>)}
    <label className="file-label" htmlFor="private-day">Private log day</label><input id="private-day" type="date" max={localDay()} value={day} onChange={(event) => { if (event.target.value && event.target.value <= localDay()) setDay(event.target.value); }} />
    <PrivateLog database={database} day={day} />
    <div className="optional-section"><h2>A separate copy, only if you choose</h2><p className="secondary">These exports include your item names and explicit entries. Ordinary JSON and CSV exports exclude them. A private restore adds missing entries and keeps existing ones.</p><div className="record-actions"><button className="secondary-button" disabled={busy} onClick={() => void exportFile(false)}>Export private JSON</button><button className="secondary-button" disabled={busy} onClick={() => void exportFile(true)}>Export private CSV</button></div>
      <label className="file-label" htmlFor="private-restore">Restore a private JSON backup</label><input id="private-restore" type="file" accept=".json,application/json" disabled={busy} onChange={(event) => { void read(event.target.files?.[0]); event.target.value = ''; }} />
      {backup && <div className="restore-preview"><p>{backup.items.length} items and {backup.entries.length} entries in this file. A backup can bring back entries you deleted.</p><div className="record-actions"><button className="secondary-button" disabled={busy} onClick={() => void perform(async () => { await restorePrivate(database, backup); setBackup(null); }, 'Private backup restored; existing entries kept.')}>Restore missing private entries</button><button className="text-button" onClick={() => setBackup(null)}>Cancel private restore</button></div></div>}
    </div>{message && <p className="message" role="status">{message}</p>}
  </div>;
}

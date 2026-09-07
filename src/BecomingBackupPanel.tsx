import { useState } from 'react';
import type { AppDatabase } from './storage';
import { download } from './DataPanel';
import { becomingBackup, becomingCsv, parseBecomingBackup, restoreBecoming, type BecomingBackup } from './becomingBackup';

export function BecomingBackupPanel({ db }: { db: AppDatabase }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [backup, setBackup] = useState<BecomingBackup | null>(null), [choices, setChoices] = useState(false);
  async function exportFile(csv: boolean) {
    setBusy(true); setMessage('');
    try { const b = await becomingBackup(db); download(csv ? becomingCsv(b) : JSON.stringify(b, null, 2), csv ? 'text/csv;charset=utf-8' : 'application/json', csv ? 'csv' : 'json', 'life-compass-becoming'); setMessage('Becoming export prepared on this device.'); }
    catch { setMessage('Could not prepare this export. Your records are still here.'); }
    finally { setBusy(false); }
  }
  async function read(file?: File) {
    setBackup(null); setChoices(false); setMessage(''); if (!file) return;
    setBusy(true);
    try { if (file.size > 20_000_000) throw new Error('This backup is too large to restore here.'); setBackup(parseBecomingBackup(await file.text())); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not read this backup.'); }
    finally { setBusy(false); }
  }
  async function restore() {
    if (!backup) return; setBusy(true);
    try { const n = await restoreBecoming(db, backup, choices); setMessage(`Restored ${n} missing Becoming records. Existing records kept.`); setBackup(null); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not restore this backup. Nothing was changed.'); }
    finally { setBusy(false); }
  }
  return <details className="becoming-details"><summary>Keep a Becoming backup</summary><p className="secondary">These files contain your direction, commitments, sittings, activity records, and planning choices, including chosen faith records. Check-ins have their own export in Readings. Private logging is excluded.</p>
    <div className="record-actions"><button className="secondary-button" disabled={busy} onClick={() => void exportFile(false)}>Export Becoming JSON</button><button className="secondary-button" disabled={busy} onClick={() => void exportFile(true)}>Export Becoming CSV</button></div>
    <label className="file-label" htmlFor="restore-becoming">Restore a Becoming JSON backup</label><input id="restore-becoming" type="file" accept=".json,application/json" disabled={busy} onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ''; }} />
    {backup && <div className="restore-preview"><p>{backup.commitments.length} commitments · {backup.sittings.length} sittings · {backup.activities.length} activity records. Only missing records are added; a backup can restore things you deleted.</p><label className="check-label"><input type="checkbox" checked={choices} onChange={(e) => setChoices(e.target.checked)} />Also restore my direction, protected choice, and planning preferences</label><div className="record-actions"><button className="primary-button" disabled={busy} onClick={() => void restore()}>Restore missing Becoming records</button><button className="text-button" onClick={() => setBackup(null)}>Cancel restore</button></div></div>}
    {message && <p role="status" className="message">{message}</p>}
  </details>;
}

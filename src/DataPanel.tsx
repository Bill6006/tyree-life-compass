import { useState } from 'react';
import { makeBackup, parseBackup, restoreBackup, toCsv, type Backup } from './backup';
import { AppDatabase } from './storage';
import { type CheckIn, type Draft } from './readings';
import { usePreferences } from './useReadings';

export function download(content: string, type: string, extension: string, prefix = 'life-compass') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `${prefix}-export-${new Date().toISOString().slice(0, 10)}.${extension}`;
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function DataPanel({ database, records, draft }: { database: AppDatabase; records: CheckIn[]; draft: Draft | null }) {
  const [message, setMessage] = useState('');
  const [backup, setBackup] = useState<Backup | null>(null);
  const [busy, setBusy] = useState(false);
  const preferences = usePreferences(database);
  const [restoreSettings, setRestoreSettings] = useState(false);
  async function readFile(file?: File) {
    setBackup(null); setMessage(''); setRestoreSettings(false);
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 20_000_000) throw new Error('This file is too large to restore here. Nothing was changed.');
      setBackup(parseBackup(await file.text()));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not read this backup. Nothing was changed.'); }
    finally { setBusy(false); }
  }
  async function restore() {
    if (!backup) return;
    setBusy(true);
    try {
      const result = await restoreBackup(database, backup, restoreSettings);
      setMessage(`Restored ${result.added} ${result.added === 1 ? 'reading' : 'readings'}. Kept ${result.kept} existing ${result.kept === 1 ? 'reading' : 'readings'} unchanged.${backup.draft ? result.draftRestored ? ' Unfinished draft restored.' : ' Unfinished draft was not replaced; an existing or newer record takes priority.' : ''}`);
      setBackup(null);
    } catch { setMessage('Could not restore this backup. Nothing was changed.'); }
    finally { setBusy(false); }
  }
  function exportFile(extension: 'json' | 'csv') {
    const data = makeBackup(records, draft, new Date().toISOString(), preferences);
    download(extension === 'json' ? JSON.stringify(data, null, 2) : toCsv(data), extension === 'json' ? 'application/json' : 'text/csv;charset=utf-8', extension);
    setMessage('Export prepared on this device. Keep the downloaded file somewhere you control.');
  }
  return <section className="detail-section data-panel" aria-labelledby="data-title">
    <h2 id="data-title">Keep a copy</h2><p className="secondary">JSON restores your readings and unfinished draft. CSV opens in a spreadsheet. These files contain your recorded phrases and times. Nothing is uploaded.</p>
    <div className="record-actions"><button className="secondary-button" disabled={busy} onClick={() => exportFile('json')}>Export JSON</button><button className="secondary-button" disabled={busy} onClick={() => exportFile('csv')}>Export CSV</button></div>
    <label className="file-label" htmlFor="restore-file">Restore a JSON backup</label><input id="restore-file" type="file" accept=".json,application/json" disabled={busy} onChange={(event) => { void readFile(event.target.files?.[0]); event.target.value = ''; }} />
    {backup && <div className="restore-preview"><p>{backup.checkIns.length} saved readings{backup.draft ? ' and one unfinished draft' : ''} in this backup.</p><p className="secondary">Only missing IDs are added. Existing readings are kept, including your corrections. A backup can restore readings you previously deleted.</p>{backup.settings && <label className="check-label"><input type="checkbox" checked={restoreSettings} onChange={(event) => setRestoreSettings(event.target.checked)} />Also restore check-in settings</label>}<div className="record-actions"><button className="primary-button" disabled={busy} onClick={() => void restore()}>Restore missing readings</button><button className="text-button" disabled={busy} onClick={() => setBackup(null)}>Cancel restore</button></div></div>}
    {message && <p className="message" role="status">{message}</p>}
  </section>;
}

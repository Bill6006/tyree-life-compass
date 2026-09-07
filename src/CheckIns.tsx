import { useEffect, useState } from 'react';
import { blocks, currentBlock, newDraft, titleCase, type Block, type CheckIn, type Draft } from './readings';
import { AppDatabase, deleteCheckIn, discardDraft, writeDraft } from './storage';
import { CheckInFlow, formatTime } from './CheckInFlow';
import { RecordView } from './RecordView';
import { DataPanel } from './DataPanel';
import { usePreferences } from './useReadings';
import { effectiveDepth, inQuietHours, localDay, preferredBlock } from './preferences';
import { ProtectedReturn } from './ProtectedReturn';

type Props = { database: AppDatabase; records: CheckIn[]; draft: Draft | null; loaded: boolean; error: string; journal: boolean; onEditingChange: (active: boolean) => void };
export function CheckIns({ database, records, draft, loaded, error: storageError, journal, onEditingChange }: Props) {
  const preferences = usePreferences(database);
  const [block, setBlock] = useState<Block>(currentBlock());
  const [session, setSession] = useState<Draft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  const [limit, setLimit] = useState(20);
  const selected = selectedId ? records.find((r) => r.id === selectedId) : journal ? undefined : records[0];
  const now = new Date(); const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const todaysWin = records.find((r) => r.evening?.minimumWin && localDay(r.occurredAt) === localDay(yesterday.toISOString()));
  const previousWin = records.find((r) => r.evening?.minimumWin)?.evening?.minimumWin;
  const quiet = inQuietHours(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`, preferences);
  const startCard = <section className="start-card" aria-labelledby="checkin-title"><div className="start-heading"><h2 id="checkin-title">How are you, right now?</h2><span className="secondary">One phrase at a time</span></div><div className="block-picker" role="group" aria-label="Check-in time">{blocks.map((item) => <button key={item} aria-pressed={block === item} onClick={() => setBlock(item)}>{titleCase(item)}</button>)}</div><button className="primary-button full-width" disabled={busy || Boolean(storageError)} onClick={() => void begin()}>Start {block} check-in <span aria-hidden="true">↗</span></button></section>;
  useEffect(() => { onEditingChange(Boolean(session)); return () => onEditingChange(false); }, [session, onEditingChange]);
  useEffect(() => { setSession(null); setSelectedId(null); setDeleteId(null); setMessage(''); setError(''); }, [journal]);
  useEffect(() => { setBlock(preferredBlock(preferences)); }, [preferences.lowDemand, preferences.frequency]);
  async function begin(record?: CheckIn) {
    setMessage(''); setError('');
    if (draft) { setError('An unfinished draft is waiting. Return to it or discard it before starting another.'); window.scrollTo({ top: 0, behavior: 'instant' }); return; }
    setBusy(true);
    const next = newDraft(record?.block ?? block, record, effectiveDepth(preferences));
    try { await writeDraft(database, next, null); setSession(next); }
    catch { setError('Could not start a draft. Check storage in About, then try again.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!deleteId) return;
    setBusy(true); setError('');
    try { await deleteCheckIn(database, deleteId); setSelectedId(null); setDeleteId(null); setMessage('Reading deleted from this device. Comparisons now use the remaining records. Copies in earlier exports are unchanged.'); }
    catch { setError('Could not delete this reading. It is still on this device.'); }
    finally { setBusy(false); }
  }
  async function removeDraft() {
    if (!draft) return;
    setBusy(true); setError('');
    try { await discardDraft(database, draft.id); setDiscard(false); setMessage('Draft discarded. Saved readings are unchanged.'); }
    catch { setError('Could not discard this draft. Reopen Today and try again.'); }
    finally { setBusy(false); }
  }
  if (session) return <CheckInFlow key={session.id} database={database} initial={session} previousWin={previousWin} onClose={() => setSession(null)} onSaved={(record) => { setSession(null); setSelectedId(record.id); setMessage(record.reportedAt === record.updatedAt ? 'Saved on this device.' : 'Correction saved. Comparisons have been recalculated.'); window.scrollTo({ top: 0, behavior: 'instant' }); }} />;
  return <>
    <div className="page-heading"><p className="eyebrow">{journal ? 'Your words, kept here' : new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</p><h1>{journal ? 'Your readings' : 'Today'}</h1></div>
    {!journal && <ProtectedReturn database={database} />}
    {(error || storageError) && <p className="message" role="alert">{error || storageError}</p>}
    {message && <p className="message" role="status">{message}</p>}
    {!journal && preferences.lowDemand && <p className="mode-note">Recover · Low-demand mode. Five readings, an evening-only plan. Skip whenever you need.</p>}
    {!journal && quiet && <p className="secondary quiet-cue">Quiet hours. A check-in is here only if you choose.</p>}
    {!journal && todaysWin && <section className="minimum-card"><p className="eyebrow">Recorded · your choice for today</p><h2>{todaysWin.evening!.minimumWin}</h2><p className="secondary">Chosen {formatTime(todaysWin.occurredAt)}. You can change or remove it in that reading.</p></section>}
    {!loaded ? <p role="status">Opening your readings…</p> : <>
      {draft && <section className="draft-card" aria-label="Unfinished check-in"><div><p className="eyebrow">An easy return</p><h2>{draft.editingId ? 'Your correction is here' : 'Your draft is here'}</h2><p className="secondary">{titleCase(draft.block)} · {formatTime(draft.occurredAt)}<br />{Object.keys(draft.answers).length} phrases kept. No need to start over.</p></div><button className="primary-button" disabled={busy} onClick={() => { setSession(draft); setError(''); setMessage(''); }}>Resume check-in</button><button className="text-button" disabled={busy} onClick={() => setDiscard(true)}>Discard draft</button>{discard && <div className="confirm-box"><p>Discard these unfinished answers? Your saved reading stays as it is.</p><div className="record-actions"><button className="secondary-button" disabled={busy} onClick={() => void removeDraft()}>Discard unfinished answers</button><button className="text-button" onClick={() => setDiscard(false)}>Keep draft</button></div></div>}</section>}
      {!journal && !draft && !selectedId && startCard}
      {selected ? <>
        {(journal || selectedId && selectedId !== records[0]?.id) && <button className="text-button" onClick={() => { setSelectedId(null); setDeleteId(null); }}>← {journal ? 'All readings' : 'Latest reading'}</button>}
        <RecordView record={selected} history={records} faithEnabled={preferences.faithEnabled} onEdit={() => void begin(selected)} onDelete={() => setDeleteId(selected.id)} />
        {deleteId === selected.id && <section className="confirm-box" aria-label="Confirm deletion"><h2>Delete this reading?</h2><p>Its answers and answering time will be removed from this device. Earlier export files keep their own copies.</p><div className="record-actions"><button className="secondary-button" disabled={busy} onClick={() => void remove()}>Delete permanently</button><button className="text-button" disabled={busy} onClick={() => setDeleteId(null)}>Keep reading</button></div></section>}
      </> : !journal && <section className="empty-reading" aria-labelledby="empty-title"><div className="empty-symbol" aria-hidden="true"><span /><span /><span /></div><p className="eyebrow">Your reading</p><h2 id="empty-title">Not logged yet</h2><p>Your first check-in will appear here.</p></section>}
      {journal && !selected && <section className="journal-list" aria-label="Saved readings"><p className="secondary">Recorded · {records.length} saved {records.length === 1 ? 'check-in' : 'check-ins'}</p>{records.length ? records.slice(0, limit).map((record) => <button className="journal-row" key={record.id} onClick={() => { setSelectedId(record.id); setMessage(''); }}><span><strong>{titleCase(record.block)}</strong><time dateTime={record.occurredAt}>{formatTime(record.occurredAt)}</time></span><span>{Object.keys(record.answers).length} phrases <span aria-hidden="true">↗</span></span></button>) : <p className="result-note">Not logged yet. Your saved check-ins will appear here.</p>}{records.length > limit && <button className="text-button" onClick={() => setLimit(limit + 20)}>Show earlier readings</button>}</section>}
      {journal && <DataPanel database={database} records={records} draft={draft} />}
      {!journal && !draft && selectedId && <div className="next-checkin">{startCard}</div>}
    </>}
  </>;
}

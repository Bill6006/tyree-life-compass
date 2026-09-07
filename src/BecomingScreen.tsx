import { useEffect, useState } from 'react';
import type { AppDatabase } from './storage';
import { usePreferences } from './useReadings';
import { useBecoming, useBecomingCounts } from './useBecoming';
import { activityLabels, protectedCommitment, type BecomingProfile, type Commitment, type LifeActivity, type Sitting } from './becomingTypes';
import { chooseProtected, deleteActivity, deleteCommitment, deleteSitting, resumeStudy, saveSitting, setPlanning, startSitting, today } from './becomingData';
import { ActivityForm, CommitmentForm, DirectionForm, SittingForm } from './BecomingForms';
import { BecomingBackupPanel } from './BecomingBackupPanel';
import { dayDate } from './mirror';

const dayLabel = (day: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(dayDate(day));
const reportLabel = (at: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(at));
function PlanningChoice({ label, value, disabled, save }: { label: string; value: boolean; disabled: boolean; save: (next: boolean) => Promise<boolean> }) {
  const [checked, setChecked] = useState(value);
  useEffect(() => setChecked(value), [value]);
  return <label className="check-label"><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => { const next = e.target.checked; setChecked(next); void save(next).then((saved) => { if (!saved) setChecked(value); }); }} />{label}</label>;
}
type Editor = { kind: 'commitment'; record?: Commitment } | { kind: 'sitting'; record: Sitting } | { kind: 'activity'; record?: LifeActivity } | { kind: 'direction'; record: BecomingProfile };
type Removal = { kind: 'commitment'; record: Commitment } | { kind: 'sitting'; record: Sitting } | { kind: 'activity'; record: LifeActivity };

export function Becoming({ database: db, onEditingChange }: { database: AppDatabase; onEditingChange: (active: boolean) => void }) {
  const data = useBecoming(db), prefs = usePreferences(db), counts = useBecomingCounts(data, prefs.faithEnabled);
  const [editor, setEditor] = useState<Editor | null>(null), [removal, setRemoval] = useState<Removal | null>(null), [focusId, setFocusId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [sittingLimit, setSittingLimit] = useState(10), [activityLimit, setActivityLimit] = useState(10);
  const primary = protectedCommitment(data), focused = data.commitments.find((c) => c.id === focusId) ?? primary;
  const openSitting = focused && data.sittings.find((s) => s.commitmentId === focused.id && s.finishedOn === null);
  const resumption = openSitting && data.activities.find((a) => a.sittingId === openSitting.id);
  const visibleActivities = data.activities.filter((a) => a.kind !== 'faith' || prefs.faithEnabled);
  useEffect(() => { onEditingChange(Boolean(editor)); return () => onEditingChange(false); }, [editor, onEditingChange]);
  useEffect(() => { if (removal) document.getElementById('becoming-delete')?.scrollIntoView({ block: 'center', behavior: 'instant' }); }, [removal]);
  function edit(value: Editor) { setEditor(value); setError(''); setMessage(''); setRemoval(null); window.scrollTo({ top: 0, behavior: 'instant' }); }
  function saved(text: string) { setEditor(null); setMessage(text); window.scrollTo({ top: 0, behavior: 'instant' }); }
  async function act(run: () => Promise<unknown>, text: string) { setBusy(true); setError(''); setMessage(''); try { await run(); setMessage(text); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Could not save this change. Your earlier records remain.'); return false; } finally { setBusy(false); } }
  async function remove() {
    if (!removal) return;
    await act(async () => { if (removal.kind === 'commitment') await deleteCommitment(db, removal.record); else if (removal.kind === 'sitting') await deleteSitting(db, removal.record); else await deleteActivity(db, removal.record); setRemoval(null); }, 'Record removed. Counts now use the remaining records. Earlier exports keep their own copies.');
  }
  const count = counts?.result;
  return <>
    <div className="page-heading becoming-heading"><p className="eyebrow">What matters, kept close</p><h1>Becoming</h1><p className="secondary">An easy return to a life you choose.</p></div>
    {(error || data.error) && <p className="message" role="alert">{error || data.error}</p>}{message && <p className="message" role="status">{message}</p>}
    {!data.loaded ? <p role="status">Opening your commitments…</p> : data.error ? null : editor ? <>
      {editor.kind === 'commitment' && <CommitmentForm db={db} original={editor.record} close={() => setEditor(null)} saved={(c) => { setFocusId(c.id); saved('Commitment kept. Opening a step records no work.'); }} />}
      {editor.kind === 'direction' && <DirectionForm db={db} profile={editor.record} close={() => setEditor(null)} saved={() => saved('Your direction is saved.')} />}
      {editor.kind === 'activity' && <ActivityForm db={db} original={editor.record} faithEnabled={prefs.faithEnabled} close={() => setEditor(null)} saved={() => saved('Activity recorded. Its date and count are yours to correct.')} />}
      {editor.kind === 'sitting' && <SittingForm db={db} original={editor.record} close={() => setEditor(null)} saved={() => saved('Sitting corrected. Counts have been recalculated.')} />}
    </> : <>
      {focused ? <section className="protected-return focus-return" aria-labelledby="focus-title">
        <p className="eyebrow">{focused.id === primary?.id ? 'Protect · your chosen return' : 'Your chosen step'}</p><h2 id="focus-title">{focused.title}</h2>
        <p className="return-step">{openSitting?.step ?? focused.nextStep}</p><p className="secondary">Stop when: {openSitting?.stopWhen ?? focused.stopWhen}</p>
        {openSitting ? <>
          <p className="secondary return-status">Recorded · started {dayLabel(openSitting.startedOn)}. Finish not logged yet.</p>
          <div className="record-actions">{openSitting.isStudy && <button className="secondary-button" disabled={busy || Boolean(resumption)} onClick={() => void act(() => resumeStudy(db, openSitting), 'Study resumption recorded. This sitting contributes one resumed-session count.')}>
            {resumption ? 'Study resumption recorded' : 'I’m resuming study now'}</button>}
            <button className="primary-button" disabled={busy} onClick={() => void act(() => saveSitting(db, openSitting, { step: openSitting.step, stopWhen: openSitting.stopWhen, startedOn: openSitting.startedOn, finishedOn: today() }), 'Stopping point recorded. One sitting finished.')}>I reached my stopping point</button></div>
          <p className="secondary">Your step stays here while you’re away. {openSitting.isStudy ? 'Each sitting can contribute one study-resumed count. ' : ''}No running timer or overdue state.</p>
        </> : <><button className="primary-button" disabled={busy} onClick={() => void act(() => startSitting(db, focused), 'Start recorded for today. Your stopping point is here when you return.')}>I’m starting this sitting</button><p className="secondary return-status">A start is recorded only when you tap. A later finish needs your own confirmation.</p></>}
        <div className="record-actions"><button className="text-button" onClick={() => edit({ kind: 'commitment', record: focused })}>Edit next step</button>{focused.id !== primary?.id && <button className="text-button" disabled={busy} onClick={() => void act(() => chooseProtected(db, focused.id), 'Protected return changed by your choice.')}>Protect this return</button>}</div>
        {focused.id !== primary?.id && primary && <button className="text-button" onClick={() => { setFocusId(primary.id); setMessage(''); }}>Return to protected: {primary.title}</button>}
      </section> : <section className="empty-reading"><p className="eyebrow">Protect</p><h2>A next step worth returning to</h2><p>Choose something that matters, one small step, and a place to stop.</p><button className="primary-button" onClick={() => edit({ kind: 'commitment' })}>Choose a commitment</button></section>}

      <section className="becoming-section" aria-labelledby="direction-title"><p className="eyebrow">Recorded · my words</p><h2 id="direction-title">Who I’m becoming</h2>
        {data.profile.direction ? <p className="direction-line">{data.profile.direction}</p> : <p className="secondary">Your line is not logged yet. It can be as small and honest as you like.</p>}
        <button className="text-button" onClick={() => edit({ kind: 'direction', record: data.profile })}>{data.profile.direction ? 'Edit my direction' : 'Write my direction'}</button>
        {counts?.error ? <p role="alert">Counts could not be calculated. Your records are available below.</p> : count ? <>
          <p className="eyebrow count-range">Calculated · counts from dated records{count.firstDay ? ` · ${dayLabel(count.firstDay)} – ${dayLabel(count.lastDay!)}` : ''}</p>
          <dl className="becoming-counts"><div><dt>Commitment sittings</dt><dd>{count.started} started · {count.finished} finished</dd></div>{Object.entries(activityLabels).filter(([kind]) => kind !== 'faith' || prefs.faithEnabled).map(([kind, label]) => <div key={kind}><dt>{label}</dt><dd>{count.activities[kind as keyof typeof activityLabels]} recorded</dd></div>)}</dl>
          <p className="secondary">All recorded dates. Counts describe entries, not a grade. One activity record is one count; time together is counted as occasions, not minutes. Opening a page adds nothing.</p>
        </> : <p role="status">Counting records on your device…</p>}
        <button className="secondary-button" onClick={() => edit({ kind: 'activity' })}>Record something I did</button>
      </section>

      <details className="becoming-details"><summary>My commitments · {data.commitments.length}</summary><p className="secondary">Your protected return stays first on Today. Only you can replace it. A reading, a quiet week, or adding a new commitment cannot push it aside.</p>
        {primary && <button className="text-button" disabled={busy} onClick={() => void act(() => chooseProtected(db, null), 'Protected choice cleared. Your commitments and records remain.')}>Clear protected choice</button>}
        {data.commitments.map((c) => <article className="commitment-row" key={c.id}><h3>{c.title}</h3><p>{c.nextStep}</p><p className="secondary">Stop when: {c.stopWhen}</p>{c.id === primary?.id && <p className="eyebrow">Protected return</p>}<div className="record-actions"><button className="text-button" onClick={() => { setFocusId(c.id); setMessage(''); window.scrollTo({ top: 0, behavior: 'instant' }); }}>Open this step</button><button className="text-button" onClick={() => edit({ kind: 'commitment', record: c })}>Edit commitment</button><button className="text-button" onClick={() => setRemoval({ kind: 'commitment', record: c })}>Delete commitment</button></div></article>)}
        <button className="secondary-button" onClick={() => edit({ kind: 'commitment' })}>Add another commitment</button>
      </details>
      <details className="becoming-details"><summary>Sitting records · {data.sittings.length}</summary><p className="secondary">Starts and finishes count these records. “Finish not logged yet” makes no claim about what happened while the app was closed.</p>
        <ol className="becoming-records" aria-label="Sitting records">{data.sittings.slice(0, sittingLimit).map((s) => <li key={s.id}><h3>{s.title}</h3><p>{s.step}</p><p className="secondary">Stop when: {s.stopWhen}</p><p>Started {dayLabel(s.startedOn)} · {s.finishedOn ? `Finished ${dayLabel(s.finishedOn)}` : 'Finish not logged yet'}</p><p className="secondary">Reported {reportLabel(s.reportedAt)} · Updated {reportLabel(s.updatedAt)}</p><div className="record-actions"><button className="text-button" onClick={() => edit({ kind: 'sitting', record: s })}>Correct sitting</button><button className="text-button" onClick={() => setRemoval({ kind: 'sitting', record: s })}>Delete sitting</button></div></li>)}</ol>{data.sittings.length > sittingLimit && <button className="text-button" onClick={() => setSittingLimit(sittingLimit + 10)}>Show 10 more sittings</button>}
      </details>
      <details className="becoming-details"><summary>Activity records · {visibleActivities.length}</summary><p className="secondary">Each count above can be traced to one entry here. Hidden faith records remain in your Becoming backup.</p>
        <ol className="becoming-records" aria-label="Activity records">{visibleActivities.slice(0, activityLimit).map((a) => <li key={a.id}><h3>{activityLabels[a.kind]}</h3><p>{dayLabel(a.day)} · 1 recorded</p>{a.note && <p>{a.note}</p>}{a.sittingId && <p className="secondary">From sitting: {data.sittings.find((s) => s.id === a.sittingId)?.title}</p>}<p className="secondary">Reported {reportLabel(a.reportedAt)} · Updated {reportLabel(a.updatedAt)}</p><div className="record-actions"><button className="text-button" onClick={() => edit({ kind: 'activity', record: a })}>Correct activity</button><button className="text-button" onClick={() => setRemoval({ kind: 'activity', record: a })}>Delete activity</button></div></li>)}</ol>{visibleActivities.length > activityLimit && <button className="text-button" onClick={() => setActivityLimit(activityLimit + 10)}>Show 10 more activities</button>}
      </details>
      <details className="becoming-details"><summary>Planning preferences</summary><p className="secondary">These are preferences for future planning. They never record a study session or attendance.</p>
        <PlanningChoice label="Keep evenings in mind for study" value={data.profile.studyEvenings} disabled={busy} save={(next) => act(() => setPlanning(db, 'studyEvenings', next), 'Planning preference saved. No activity was recorded.')} />
        {prefs.faithEnabled && <PlanningChoice label="Keep Saturday in mind for church" value={data.profile.churchSaturday} disabled={busy} save={(next) => act(() => setPlanning(db, 'churchSaturday', next), 'Planning preference saved. No attendance was recorded.')} />}
      </details>
      <BecomingBackupPanel db={db} />
      <p className="quiet-note">Your words and records stay on this device. You can choose a different direction whenever you need.</p>
    </>}
    {removal && <section id="becoming-delete" className="confirm-box" aria-label="Confirm record deletion"><h2>Delete this {removal.kind}?</h2><p>{removal.kind === 'commitment' ? 'Its sitting records and linked study resumptions will also be removed. Other activity records stay.' : removal.kind === 'sitting' ? 'Its linked study resumption will also be removed. The commitment and its next step stay.' : 'This one count and its note will be removed.'} Earlier export files keep their own copies.</p><div className="record-actions"><button className="secondary-button" disabled={busy} onClick={() => void remove()}>Delete record permanently</button><button className="text-button" onClick={() => setRemoval(null)}>Keep record</button></div></section>}
  </>;
}

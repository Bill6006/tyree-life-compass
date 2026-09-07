import { useState, type ReactNode } from 'react';
import type { AppDatabase } from './storage';
import { saveActivity, saveCommitment, saveDirection, saveSitting, today } from './becomingData';
import { activityLabels, type ActivityKind, type BecomingProfile, type Commitment, type LifeActivity, type Sitting } from './becomingTypes';

function FormShell({ title, children, save, close, label = 'Save record' }: { title: string; children: ReactNode; save: () => Promise<void>; close: () => void; label?: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <section className="becoming-form" aria-label={title}><h2>{title}</h2><form onSubmit={(e) => { e.preventDefault(); setBusy(true); setError(''); void save().catch((e) => setError(e instanceof Error ? e.message : 'Could not save. Your earlier records are unchanged.')).finally(() => setBusy(false)); }}>
    <fieldset disabled={busy}>{children}<div className="record-actions"><button className="primary-button" type="submit">{label}</button><button className="text-button" type="button" onClick={close}>Cancel edit</button></div></fieldset>
    {error && <p role="alert">{error}</p>}
  </form></section>;
}
export function CommitmentForm({ db, original, close, saved }: { db: AppDatabase; original?: Commitment; close: () => void; saved: (c: Commitment) => void }) {
  const [title, setTitle] = useState(original?.title ?? ''), [nextStep, setNextStep] = useState(original?.nextStep ?? ''), [stopWhen, setStopWhen] = useState(original?.stopWhen ?? ''), [isStudy, setIsStudy] = useState(original?.isStudy ?? false);
  return <FormShell title={original ? 'Edit the next sitting' : 'Choose a commitment'} label={original ? 'Save next step' : 'Keep this commitment'} close={close} save={async () => saved(await saveCommitment(db, { title, nextStep, stopWhen, isStudy }, original))}>
    <label>What matters to me<input autoFocus required maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
    <label>My next small step<input required maxLength={240} value={nextStep} onChange={(e) => setNextStep(e.target.value)} /></label>
    <label>I can stop when<input required maxLength={240} value={stopWhen} onChange={(e) => setStopWhen(e.target.value)} /></label>
    <label className="check-label"><input type="checkbox" checked={isStudy} onChange={(e) => setIsStudy(e.target.checked)} />This is study</label>
    <p className="secondary">Choose a stopping point that fits one sitting. {original ? 'An already-started sitting keeps its recorded step. You can correct it in the sitting history.' : 'Your first commitment becomes your protected return. Adding another keeps your existing choice.'}</p>
  </FormShell>;
}
export function DirectionForm({ db, profile, close, saved }: { db: AppDatabase; profile: BecomingProfile; close: () => void; saved: () => void }) {
  const [direction, setDirection] = useState(profile.direction);
  return <FormShell title="My direction, in my words" close={close} label="Save my direction" save={async () => { await saveDirection(db, direction, profile); saved(); }}>
    <label>Who I’m becoming<input autoFocus maxLength={240} value={direction} onChange={(e) => setDirection(e.target.value)} /></label><p className="secondary">One line about where you’re going. Leave it blank to remove it.</p>
  </FormShell>;
}
export function ActivityForm({ db, original, faithEnabled, close, saved }: { db: AppDatabase; original?: LifeActivity; faithEnabled: boolean; close: () => void; saved: () => void }) {
  const [kind, setKind] = useState<ActivityKind>(original?.kind ?? 'conversation'), [day, setDay] = useState(original?.day ?? today()), [note, setNote] = useState(original?.note ?? '');
  return <FormShell title={original ? 'Correct an activity record' : 'Record something I did'} close={close} label={original ? 'Save activity correction' : 'Record one activity'} save={async () => { await saveActivity(db, { kind, day, note }, original); saved(); }}>
    <label>What happened<select value={kind} disabled={Boolean(original?.sittingId)} onChange={(e) => setKind(e.target.value as ActivityKind)}>{Object.entries(activityLabels).filter(([id]) => id !== 'faith' || faithEnabled).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    <label>Activity date<input type="date" required max={today()} value={day} onChange={(e) => setDay(e.target.value)} /></label>
    <label>Optional note<input maxLength={240} value={note} onChange={(e) => setNote(e.target.value)} /></label>
    <p className="secondary">One record adds one count. Time with your daughter means time together; it does not require teaching. Record study here when it happened outside an app sitting, so the same return is not counted twice.</p>
    {original?.sittingId && <p className="secondary">This study resumption belongs to a recorded sitting. Its date stays within that sitting’s dates.</p>}
  </FormShell>;
}
export function SittingForm({ db, original, close, saved }: { db: AppDatabase; original: Sitting; close: () => void; saved: () => void }) {
  const [step, setStep] = useState(original.step), [stopWhen, setStopWhen] = useState(original.stopWhen), [startedOn, setStartedOn] = useState(original.startedOn), [finished, setFinished] = useState(original.finishedOn !== null), [finishedOn, setFinishedOn] = useState(original.finishedOn ?? today());
  return <FormShell title="Correct a sitting record" close={close} label="Save sitting correction" save={async () => { await saveSitting(db, original, { step, stopWhen, startedOn, finishedOn: finished ? finishedOn : null }); saved(); }}>
    <label>Recorded step<input maxLength={240} required value={step} onChange={(e) => setStep(e.target.value)} /></label><label>Recorded stopping point<input maxLength={240} required value={stopWhen} onChange={(e) => setStopWhen(e.target.value)} /></label>
    <label>Started on<input type="date" required max={today()} value={startedOn} onChange={(e) => setStartedOn(e.target.value)} /></label>
    <label className="check-label"><input type="checkbox" checked={finished} onChange={(e) => setFinished(e.target.checked)} />A finish was recorded</label>
    {finished && <label>Finished on<input type="date" required min={startedOn} max={today()} value={finishedOn} onChange={(e) => setFinishedOn(e.target.value)} /></label>}
    <p className="secondary">Unchecking the finish restores “Finish not logged yet.” Dates record what you report; exact start or finish times are not inferred.</p>
  </FormShell>;
}

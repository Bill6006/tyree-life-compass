import { useEffect, useRef, useState } from 'react';
import { questionsFor, readings, titleCase, type Anchor, type CheckIn, type Draft } from './readings';
import { AppDatabase, saveCheckIn, writeDraft } from './storage';
import { usePreferences } from './useReadings';
import { EveningExtras } from './EveningExtras';
import { localDay } from './preferences';

export function formatTime(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }
function localInput(value: string) { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }

export function CheckInFlow({ database, initial, previousWin, onClose, onSaved }: { database: AppDatabase; initial: Draft; previousWin?: string; onClose: () => void; onSaved: (record: CheckIn) => void }) {
  const [draft, setDraft] = useState(initial);
  const draftRef = useRef(initial);
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const preferences = usePreferences(database);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Anchor | null>(null);
  const [time, setTime] = useState(localInput(draft.occurredAt));
  const [changeTime, setChangeTime] = useState(false);
  const clock = useRef(performance.now());
  const active = useRef(0);
  const visible = useRef(!document.hidden);
  const heading = useRef<HTMLHeadingElement>(null);
  const ids = questionsFor(draft.block, draft.depth);
  const id = ids[draft.index];
  const reading = id ? readings[id] : null;
  function tick() {
    const now = performance.now();
    // Count visible interaction intervals, excluding long pauses and closed time.
    if (visible.current) active.current += Math.min(now - clock.current, 30000);
    clock.current = now;
  }
  useEffect(() => {
    const onVisibility = () => { tick(); visible.current = !document.hidden; };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }, [draft.index]);

  async function update(changes: Partial<Draft> | ((current: Draft) => Partial<Draft>), save = false) {
    setBusy(true); setError('');
    const task = queue.current.then(async () => {
      const previous = draftRef.current;
      tick();
      const next = { ...previous, ...(typeof changes === 'function' ? changes(previous) : changes), revision: previous.revision + 1, answeringMs: previous.answeringMs + Math.round(active.current) };
      active.current = 0;
      try {
      await writeDraft(database, next, previous.revision);
      draftRef.current = next; setDraft(next);
      if (save) {
        const record = await saveCheckIn(database, next);
        if (record) onSaved(record);
        else setError('Nothing recorded yet. Pick a phrase or return to Today; your earlier reading is unchanged.');
      }
      return true;
    } catch (error) {
      setError(error instanceof Error && /changed|elsewhere/.test(error.message) ? error.message : 'Could not save on this device. Your last saved draft is safe. Try this step again.');
      return false;
    }});
    queue.current = task;
    const success = await task;
    if (queue.current === task) { setBusy(false); setPicked(null); }
    return success;
  }
  function answer(value: Anchor | undefined) {
    const answers = { ...draft.answers };
    if (value === undefined) delete answers[id]; else answers[id] = value;
    setPicked(value ?? null);
    void update({ answers, index: draft.index + 1 });
  }
  async function close() {
    if (await update({})) onClose();
  }
  async function setReadingTime() {
    const timestamp = new Date(time);
    if (!time || Number.isNaN(timestamp.getTime()) || timestamp.getTime() > Date.now() + 60000) { setError('Choose a reading time that has already happened.'); return; }
    await update({ occurredAt: timestamp.toISOString() });
    setChangeTime(false);
  }
  return <div className="check-in-flow">
    <div className="flow-top"><button className="text-button" disabled={busy} onClick={() => void close()}>← Return to Today</button><span className="secondary">{titleCase(draft.block)}</span></div>
    <p className="eyebrow">{draft.editingId ? 'Correcting a reading' : draft.depth === 'brief' ? 'A brief check-in' : 'One moment for you'} · {id ? `${draft.index + 1} of ${ids.length}` : 'Ready to keep'}</p>
    <p className="flow-date">Reading time · {formatTime(draft.occurredAt)}</p>
    {reading ? <>
      <h1 ref={heading} tabIndex={-1}>{reading.label}</h1>
      <p className="question-prompt">{reading.prompt}</p>
      <div className="anchor-list" role="group" aria-label={reading.label}>
        {reading.anchors.map((phrase, index) => {
          const [word, description] = phrase.split(' — ');
          return <button key={phrase} disabled={busy} className="anchor-button" aria-pressed={picked === index || draft.answers[id] === index} onClick={() => answer(index as Anchor)}><span>{word}</span><span>{description}</span></button>;
        })}
      </div>
      <div className="flow-actions"><button className="text-button" disabled={busy || draft.index === 0} onClick={() => void update({ index: draft.index - 1 })}>← Previous</button><button className="text-button" disabled={busy} onClick={() => answer(undefined)}>Skip this reading →</button></div>
      <button className="secondary-button full-width" disabled={busy || Object.keys(draft.answers).length === 0} onClick={() => void update({ index: ids.length })}>Keep these answers</button>
      <p className="quiet-note">Pick what fits. A skip stays empty. Your draft saves on this device as you go.</p>
    </> : <>
      <h1 ref={heading} tabIndex={-1}>A moment, recorded.</h1>
      <p className="question-prompt">{Object.keys(draft.answers).length} of {ids.length} readings picked. Unanswered readings stay empty.</p>
      <dl className="review-answers">{ids.map((id, index) => <div key={id}><dt>{readings[id].label}</dt><dd><button className="review-answer" disabled={busy} onClick={() => void update({ index })}>{draft.answers[id] === undefined ? 'Not logged yet' : readings[id].anchors[draft.answers[id]!]}</button></dd></div>)}</dl>
      <button className="text-button" disabled={busy} onClick={() => setChangeTime(!changeTime)}>Change reading time</button>
      {changeTime && <div className="time-editor"><label htmlFor="reading-time">When did this reading describe you?</label><input id="reading-time" type="datetime-local" value={time} onChange={(event) => setTime(event.target.value)} /><button className="secondary-button" disabled={busy} onClick={() => void setReadingTime()}>Use this time</button></div>}
      {draft.block === 'evening' && <EveningExtras database={database} values={draft.evening ?? {}} preferences={preferences} day={localDay(draft.occurredAt)} previousWin={previousWin} disabled={busy} onChange={(key, value) => { void update((current) => { const evening = { ...current.evening }; if (value === undefined) delete evening[key]; else Object.assign(evening, { [key]: value }); return { evening }; }); }} />}
      <button className="primary-button full-width" disabled={busy || changeTime || Object.keys(draft.answers).length === 0 && Object.keys(draft.evening ?? {}).length === 0} onClick={() => void update({}, true)}>{busy ? 'Saving on this device…' : draft.editingId ? 'Save correction' : 'Save check-in'}</button>
      <p className="quiet-note">{draft.editingId ? 'Your correction replaces these answers. The original reporting time stays recorded.' : 'A reading of this moment. Never a score of you as a person.'}</p>
    </>}
    {error && <p className="message" role="alert">{error}</p>}
  </div>;
}

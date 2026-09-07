import { useState } from 'react';
import { type EveningExtras as Values } from './readings';
import { type Preferences, localDay } from './preferences';
import { type AppDatabase, changePreferences } from './storage';
import { PrivateLog } from './PrivateLog';

export function ChoiceChips({ label, value, onChange, disabled = false, yes = 'Yes', no = 'No' }: { label: string; value: boolean | undefined; onChange: (value: boolean | undefined) => void; disabled?: boolean; yes?: string; no?: string }) {
  return <fieldset className="choice-chips"><legend>{label}</legend><div>{([true, false, undefined] as const).map((v) => <button type="button" key={String(v)} aria-pressed={v === value} disabled={disabled} onClick={() => onChange(v)}>{v === undefined ? 'Not logged' : v ? yes : no}</button>)}</div></fieldset>;
}
export function EveningExtras({ database, values, preferences, day, previousWin, onChange, disabled }: { database: AppDatabase; values: Values; preferences: Preferences; day: string; previousWin?: string; onChange: (key: keyof Values, value: string | boolean | undefined) => void; disabled: boolean }) {
  const [text, setText] = useState(values.minimumWin ?? ''); const [error, setError] = useState('');
  async function hideFaith() { try { await changePreferences(database, { faithEnabled: false }); } catch { setError('Could not change this setting. Try again.'); } }
  return <>
    <details className="evening-extras" open={Object.keys(values).length > 0 || undefined}><summary>Optional · end the day gently</summary><p className="secondary">Leave any of these empty. They never raise or lower your score.</p>
      <label className="file-label" htmlFor="minimum-win">Tomorrow’s minimum win</label><input id="minimum-win" value={text} maxLength={240} autoComplete="off" placeholder="One small thing, in your words" onChange={(event) => { setText(event.target.value); onChange('minimumWin', event.target.value.trim() || undefined); }} />
      {previousWin && <button className="text-button" disabled={disabled} onClick={() => { setText(previousWin); onChange('minimumWin', previousWin); }}>Reuse last: {previousWin}</button>}
      <ChoiceChips label="Caffeine after midday?" value={values.caffeineAfterMidday} onChange={(v) => onChange('caffeineAfterMidday', v)} disabled={disabled} />
      <ChoiceChips label="Late or heavy dinner?" value={values.lateDinner} onChange={(v) => onChange('lateDinner', v)} disabled={disabled} />
    </details>
    {preferences.faithEnabled && <section className="optional-section" aria-label="Optional faith reflection"><ChoiceChips label="Felt close to God today?" value={values.closeToGod} onChange={(v) => onChange('closeToGod', v)} disabled={disabled} /><button className="text-button" onClick={() => void hideFaith()}>Turn off this question</button><p className="secondary">An optional reflection. Never a streak or part of your score.</p></section>}
    {preferences.privateEnabled && <PrivateLog database={database} day={day} />}
    {error && <p role="alert">{error}</p>}
  </>;
}

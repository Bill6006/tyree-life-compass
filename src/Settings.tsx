import { useState } from 'react';
import { type AppDatabase, changePreferences } from './storage';
import { usePreferences } from './useReadings';
import { alarmPlan, effectiveDepth, plannedBlocks, validTime, type Preferences } from './preferences';
import { blocks, titleCase } from './readings';
import { PrivateSettings } from './PrivateLog';

export function Settings({ database }: { database: AppDatabase }) {
  const p = usePreferences(database); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  async function change(patch: Partial<Preferences>) {
    setBusy(true); setMessage('');
    try { await changePreferences(database, patch); setMessage('Settings saved on this device. Android alarms stay as you set them.'); }
    catch { setMessage('Could not save settings. Try again.'); }
    finally { setBusy(false); }
  }
  return <>
    <div className="page-heading"><p className="eyebrow">Make room for real life</p><h1>Settings</h1></div>
    <section className="low-demand-card"><div><p className="eyebrow">Recover</p><h2>A lighter week</h2><p className="secondary">Five readings, an evening-only plan, and room to skip. Your usual depth and frequency stay saved.</p></div><button className="primary-button" disabled={busy} aria-pressed={p.lowDemand} onClick={() => void change({ lowDemand: !p.lowDemand })}>{p.lowDemand ? 'Restore my usual settings' : 'Use low-demand mode'}</button>{p.lowDemand && <p className="secondary">Low-demand mode is on. Your usual choice: {titleCase(p.depth)} · {p.frequency === 0 ? 'no planned check-ins' : `${p.frequency} planned daily`}.</p>}</section>
    <section className="detail-section"><h2>How much to ask</h2><p className="secondary">Depth changes the questions in a new check-in. An open draft keeps its original set.</p><div className="setting-options" role="group" aria-label="Check-in depth">{(['standard','brief'] as const).map((depth) => <button className="setting-option" key={depth} disabled={busy || p.lowDemand} aria-pressed={effectiveDepth(p) === depth} onClick={() => void change({ depth })}><strong>{titleCase(depth)}</strong><span>{depth === 'standard' ? '13 morning readings · 5 later' : '5 readings at any time'}</span></button>)}</div></section>
    <section className="detail-section"><h2>How often to check in</h2><p className="secondary">A plan you choose, never a debt. You can still open a check-in whenever you want.</p><div className="setting-options" role="group" aria-label="Check-in frequency">{([0,1,2,3] as const).map((n) => <button className="setting-option" key={n} disabled={busy || p.lowDemand} aria-pressed={(p.lowDemand ? 1 : p.frequency) === n} onClick={() => void change({ frequency: n })}><strong>{['None planned','Once a day','Twice a day','Three times a day'][n]}</strong><span>{['Open whenever you choose','Evening','Morning and evening','Morning, afternoon, evening'][n]}</span></button>)}</div></section>
    <section className="detail-section"><h2>Quiet hours</h2><p className="secondary">Planned times inside this window are left out. Matching start and end times turns quiet hours off.</p><div className="time-grid">{(['quietStart','quietEnd'] as const).map((key) => <label key={key}>{key === 'quietStart' ? 'Quiet from' : 'Quiet until'}<input type="time" value={p[key]} disabled={busy} onChange={(event) => { if (validTime(event.target.value)) void change({ [key]: event.target.value }); }} /></label>)}</div></section>
    <section className="detail-section"><h2>Your Android alarm plan</h2><p className="secondary">This web app cannot reliably ring while closed. In your Android Clock app, create repeating daily alarms for the times below. Use a neutral label such as “A moment for me.”</p><div className="time-grid">{blocks.map((block) => <label key={block}>{titleCase(block)} time<input type="time" value={p.times[block]} disabled={busy} onChange={(event) => { if (validTime(event.target.value)) void change({ times: { ...p.times, [block]: event.target.value } }); }} /></label>)}</div>
      <div className="alarm-plan" aria-label="Planned alarm times">{alarmPlan(p).length ? alarmPlan(p).map(({ block, time }) => <p key={block}>{titleCase(block)} · {time}</p>) : <p>No alarms in this plan.</p>}</div>
      {alarmPlan(p).length < plannedBlocks(p).length && <p className="secondary">Some planned times are inside quiet hours, so they are omitted.</p>}
      <p className="secondary">Settings here do not create, change, silence, or cancel Android alarms. Update or disable those alarms yourself after changing frequency, quiet hours, or low-demand mode. All times use the device’s local time. No catch-up alarms or escalating reminders.</p>
    </section>
    <section className="detail-section"><h2>Only if you choose</h2><button className="setting-toggle" disabled={busy} aria-pressed={p.faithEnabled} onClick={() => void change({ faithEnabled: !p.faithEnabled })}><span>Faith reflection<span className="secondary">One optional evening question. Never a streak.</span></span><span>{p.faithEnabled ? 'On' : 'Off'}</span></button><p className="secondary">Turning this off hides the question and its saved answers in the app. Earlier answers stay in your ordinary backup.</p>
      <button className="setting-toggle" disabled={busy} aria-pressed={p.privateEnabled} onClick={() => void change({ privateEnabled: !p.privateEnabled })}><span>Private logging<span className="secondary">Items named by you, kept on this device.</span></span><span>{p.privateEnabled ? 'On' : 'Off'}</span></button>
      {p.privateEnabled && <PrivateSettings database={database} />}
    </section>
    <button className="text-button" disabled={busy} onClick={() => void change({ depth: 'standard', frequency: 3, lowDemand: false, quietStart: '22:00', quietEnd: '07:00', times: { morning: '08:00', afternoon: '14:00', evening: '21:00' }, faithEnabled: false, privateEnabled: false })}>Reset settings to defaults</button><p className="secondary">Resetting settings leaves your recorded entries intact and hides optional logging.</p>
    {message && <p className="message" role="status">{message}</p>}
  </>;
}

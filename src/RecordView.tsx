import { coreIds, formatScore, questionsFor, readings, titleCase, type CheckIn } from './readings';
import { useSummary } from './useReadings';
import { formatTime } from './CheckInFlow';

export function RecordView({ record, history, faithEnabled = false, onEdit, onDelete }: { record: CheckIn; history: CheckIn[]; faithEnabled?: boolean; onEdit: () => void; onDelete: () => void }) {
  const { summary, error } = useSummary(record, history);
  return <>
    <section className="reading-card" aria-label="Your saved reading">
      <p className="eyebrow">Calculated · {titleCase(record.block)}</p>
      <p className="reading-time"><time dateTime={record.occurredAt}>{formatTime(record.occurredAt)}</time></p>
      {summary ? <>
        <div className="score-line"><h2>{summary.score === null ? 'Incomplete' : <><span className="score-number">{formatScore(summary.score)}</span><span className="score-scale"> / 100</span></>}</h2><span className="score-caption">A reading,<br />never a verdict.</span></div>
        {summary.score === null && <p className="secondary">Not logged: {summary.missing.map((id) => readings[id].label.toLowerCase()).join(', ')}. These four ingredients always stay the same.</p>}
        {summary.score === null && summary.lastComplete && <p className="last-complete">Last complete reading: <strong>{formatScore(summary.lastComplete.score)}</strong> / 100 · {formatTime(summary.lastComplete.at)}</p>}
      </> : <h2 role="status">{error ? 'Calculation unavailable' : 'Calculating your reading…'}</h2>}
      <details className="explanation"><summary>What goes into this reading?</summary><p>Mood, energy, irritation, and stress have equal weight. Each phrase maps to 0, 25, 50, 75, or 100. Irritation and stress run in the other direction. The four values are averaged; a missing ingredient means Incomplete.</p><p>This is a practical calculation, not a validated clinical scale. Other readings are context. Recipe: core-four-v1 · Phrases: version 1.</p></details>
    </section>
    {summary && <section className="comparison-section" aria-labelledby="comparison-title">
      <p className="eyebrow">Calculated · from your recorded phrases</p><h2 id="comparison-title">Since your earlier readings</h2>
      {summary.comparisons.length ? <>
        <ul className="comparison-list">{summary.comparisons.slice(0, 3).map((item) => <li key={item.id}><span><strong>{readings[item.id].label}</strong><span className="comparison-words">{readings[item.id].anchors[item.previous].split(' — ')[0]} → {readings[item.id].anchors[item.current].split(' — ')[0]}</span><span className="comparison-date">Earlier · {formatTime(item.previousAt)}</span></span><span className="comparison-delta">{item.delta === 0 ? 'Same phrase' : `${Math.abs(item.delta / 25)} ${Math.abs(item.delta / 25) === 1 ? 'step' : 'steps'} ${item.delta > 0 ? 'up' : 'down'}`}</span></li>)}</ul>
        <p className="secondary">Steps describe phrase positions, not improvement or a cause.</p>
        {summary.comparisons.length > 3 && <details className="explanation"><summary>All {summary.comparisons.length} comparisons</summary>{summary.comparisons.map((item) => <p key={item.id}><strong>{readings[item.id].label}:</strong> {readings[item.id].anchors[item.previous]} → {readings[item.id].anchors[item.current]}. Earlier: {formatTime(item.previousAt)}.</p>)}</details>}
      </> : <p className="secondary result-note">{history.some((item) => item.id !== record.id) ? 'No earlier matching phrases to compare yet. Your saved words are here below.' : 'Your first reference point. These words are here to return to; a later reading can show what changed.'}</p>}
    </section>}
    <details className="recorded-panel"><summary>Recorded · your phrases</summary><dl className="phrase-list">{questionsFor(record.block, record.depth).map((id) => <div key={id}><dt>{readings[id].label}{coreIds.includes(id) ? ' · score ingredient' : ''}</dt><dd>{record.answers[id] === undefined ? 'Not logged yet' : readings[id].anchors[record.answers[id]!]}</dd></div>)}</dl><p className="secondary">Reported {formatTime(record.reportedAt)}{record.updatedAt !== record.reportedAt ? ` · Corrected ${formatTime(record.updatedAt)}` : ''}.</p><p className="secondary">Active answering time: {Math.round(record.answeringMs / 1000)} seconds. Closed time and pauses beyond 30 seconds between interactions are excluded.</p></details>
    {record.block === 'evening' && <details className="recorded-panel"><summary>Recorded · evening extras</summary><dl className="phrase-list"><div><dt>Tomorrow’s minimum win</dt><dd>{record.evening?.minimumWin ?? 'Not logged yet'}</dd></div>{([['caffeineAfterMidday','Caffeine after midday'],['lateDinner','Late or heavy dinner'], ...(faithEnabled ? [['closeToGod','Felt close to God today']] : [])] as [keyof NonNullable<CheckIn['evening']>, string][]).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{record.evening?.[key] === undefined ? 'Not logged yet' : record.evening[key] ? 'Yes' : 'No'}</dd></div>)}</dl><p className="secondary">Context you chose to record. These entries do not change the score.</p></details>}
    {summary && <details className="recorded-panel"><summary>Recorded · context alongside this reading</summary><p className="secondary">The most recent available context at this reading’s time. Each item keeps its own timestamp; none changes the score.</p>{summary.context.length ? <dl className="phrase-list">{summary.context.map((item) => <div key={item.id}><dt>{readings[item.id].label} · {formatTime(item.at)}</dt><dd>{readings[item.id].anchors[item.value]}</dd></div>)}</dl> : <p className="secondary">Not logged yet.</p>}</details>}
    <div className="record-actions"><button className="text-button" onClick={onEdit}>Correct this reading</button><button className="text-button" onClick={onDelete}>Delete this reading</button></div>
  </>;
}

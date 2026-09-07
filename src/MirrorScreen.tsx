import { useMemo, useState, type CSSProperties } from 'react';
import { blocks, formatScore, readingIds, readings, titleCase, type CheckIn, type ReadingId } from './readings';
import { dayDate, type Metric, type MirrorDay, type MirrorQuery, type Relationship, type TracePoint } from './mirror';
import { useLocalDay, useMirror } from './useMirror';

const dateLabel = (day: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(dayDate(day));
const fullDate = (day: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'full' }).format(dayDate(day));
const stamp = (at: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(at));
function valueLabel(point: TracePoint, metric: Metric): string {
  if (point.value === null) return metric === 'score' ? 'Incomplete' : 'Not logged yet';
  return metric === 'score' ? `${formatScore(point.value)} / 100` : readings[metric].anchors[point.value / 25];
}

function PointList({ points, metric, name }: { points: TracePoint[]; metric: Metric; name: string }) {
  const [limit, setLimit] = useState(20);
  return <>
    <ol className="mirror-records" aria-label={name}>
      {points.slice(0, limit).map((point) => <li key={point.id}><span><time dateTime={point.at}>{stamp(point.at)}</time> · {titleCase(point.block)}</span><strong>{valueLabel(point, metric)}</strong></li>)}
    </ol>
    {points.length > limit && <button className="text-button" onClick={() => setLimit(limit + 20)}>Show 20 more records</button>}
  </>;
}

function Trace({ days, metric, period }: { days: MirrorDay[]; metric: Metric; period: 'today' | 'week' }) {
  const shown = period === 'today' ? days.slice(-1) : days.slice(-7);
  const points = shown.flatMap((day) => day.points);
  const present = points.filter((p) => p.value !== null).length;
  const isScore = metric === 'score';
  const x = (index: number, at: string) => {
    const time = new Date(at);
    const fraction = (time.getHours() * 60 + time.getMinutes()) / 1440;
    return 26 + (index + fraction) / shown.length * 278;
  };
  return <section className="mirror-card" aria-labelledby="trace-title">
    <p className="eyebrow">{isScore ? 'Calculated · equal weights' : 'Recorded · your phrases'}</p>
    <div className="mirror-section-heading"><h2 id="trace-title">{period === 'today' ? 'Today’s trace' : 'The last seven days'}</h2><span className="secondary">{present} {present === 1 ? 'point' : 'points'}</span></div>
    <p className="secondary">{dateLabel(shown[0].day)}{shown.length > 1 ? ` – ${dateLabel(shown.at(-1)!.day)}` : ''} · device-local time</p>
    <svg className="trace-chart" viewBox="0 0 330 198" role="img" aria-label={`${isScore ? 'Fixed score' : readings[metric].label} trace: ${present} recorded points, ${points.length - present} unanswered in saved check-ins. Exact values follow in Trace records.`}>
      {[0, 50, 100].map((value) => <g key={value}><line x1="26" x2="304" y1={134 - value} y2={134 - value} className="chart-guide" />{isScore && <text x="21" y={138 - value} textAnchor="end">{value}</text>}</g>)}
      {!isScore && <><text x="26" y="22">Last phrase</text><text x="26" y="150">First phrase</text></>}
      {shown.map((day, index) => <g key={day.day}>
        {period === 'week' && <><line x1={26 + index * 278 / 7} x2={26 + index * 278 / 7} y1="30" y2="154" className="chart-divider" />
          <text x={26 + (index + .5) * 278 / 7} y="178" textAnchor="middle">{new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(dayDate(day.day))}<tspan x={26 + (index + .5) * 278 / 7} dy="14">{dayDate(day.day).getDate()}</tspan></text></>}
        {day.points.map((point) => point.value === null
          ? <path key={point.id} d={`M${x(index, point.at) - 3} 158l6 6m-6 0 6-6`} className="chart-missing"><title>{stamp(point.at)} · {valueLabel(point, metric)}</title></path>
          : <circle key={point.id} cx={x(index, point.at)} cy={134 - point.value} r="4" className="chart-point"><title>{stamp(point.at)} · {valueLabel(point, metric)}</title></circle>)}
      </g>)}
      {period === 'today' && ['00:00', '06:00', '12:00', '18:00', '24:00'].map((label, i) => <text key={label} x={26 + i * 278 / 4} y="184" textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}>{label}</text>)}
    </svg>
    {points.length === 0 && <p className="mirror-empty">Not logged yet. Your next saved reading can be a reference point.</p>}
    {points.length > 0 && present === 0 && <p className="mirror-empty">{isScore ? 'No complete score in this view.' : 'This reading is not logged in this view.'}</p>}
    <p className="secondary">A dot is one recorded check-in{isScore ? ' with all four score ingredients' : ''}. × means {isScore ? 'an incomplete score' : 'an unanswered reading'} in a saved check-in. Overlapping dots may share a time and value. Gaps stay empty.</p>
    {isScore ? <details className="mirror-details"><summary>The fixed recipe</summary><p>Mood, energy, reversed irritation, and reversed stress, weighted equally. All four must be answered. Context never fills a gap. This is a practical reading, not a clinical scale.</p></details>
      : <details className="mirror-details"><summary>The five phrases, in chart order</summary><ol>{readings[metric].anchors.map((phrase) => <li key={phrase}>{phrase}</li>)}</ol><p>The first phrase is at the bottom, the last at the top. Higher does not always mean better. Sleep duration stays in ranges.</p></details>}
    <details className="mirror-details"><summary>Trace records · {points.length} saved check-ins</summary>
      <PointList key={`${metric}-${period}`} points={points} metric={metric} name="Trace records" />
      {shown.filter((day) => !day.points.length).map((day) => <p key={day.day}>{dateLabel(day.day)} · Not logged yet</p>)}
    </details>
  </section>;
}

function Heatmap({ days }: { days: MirrorDay[] }) {
  const [picked, setPicked] = useState(days.at(-1)!.day);
  const selected = days.find((day) => day.day === picked) ?? days.at(-1)!;
  return <section className="mirror-card" aria-labelledby="heatmap-title">
    <p className="eyebrow">Calculated · complete scores only</p><h2 id="heatmap-title">Four weeks, at a glance</h2>
    <p className="secondary">{dateLabel(days[0].day)} – {dateLabel(days.at(-1)!.day)}. Each cell is the mean of that day’s complete scores. Tap a day for its counts.</p>
    <table className="heatmap" aria-label="Daily mean of complete scores over the last 28 days">
      <thead><tr><th scope="col"><span className="visually-hidden">Day</span></th>{[0, 7, 14, 21].map((i) => <th scope="col" key={i}>From<br />{dateLabel(days[i].day)}</th>)}</tr></thead>
      <tbody>{Array.from({ length: 7 }, (_, row) => <tr key={row}><th scope="row">{new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(dayDate(days[row].day))}</th>{[0, 7, 14, 21].map((offset) => {
        const day = days[offset + row];
        const label = `${fullDate(day.day)}: ${day.average === null ? day.incomplete ? 'Incomplete only' : 'Not logged yet' : `mean ${formatScore(day.average)} out of 100`}; ${day.complete} complete, ${day.incomplete} incomplete`;
        return <td key={day.day}><button aria-label={label} aria-pressed={selected.day === day.day} className={`heat-cell${day.average === null ? ' heat-empty' : ''}`} style={{ '--heat': day.average === null ? 0 : .08 + day.average / 100 * .25 } as CSSProperties} onClick={() => setPicked(day.day)}>
          <span aria-hidden="true">{day.average === null ? day.incomplete ? '×' : '·' : formatScore(day.average)}</span></button></td>;
      })}</tr>)}</tbody>
    </table>
    <p className="secondary heat-legend">· Not logged yet &nbsp; × Incomplete only<br />Deeper orange = higher mean. No missing answers become zero.</p>
    <div className="heat-day" aria-live="polite" aria-atomic="true">
      <h3>{fullDate(selected.day)}</h3>
      <p>{selected.average === null ? selected.incomplete ? 'Incomplete · no daily mean' : 'Not logged yet' : `Mean ${formatScore(selected.average)} / 100`}</p>
      <p className="secondary">{selected.complete} complete · {selected.incomplete} incomplete · {selected.points.length} saved check-ins</p>
    </div>
    {!!selected.points.length && <details className="mirror-details" key={selected.day}><summary>Scores recorded on this day</summary><PointList points={selected.points.map((p) => ({ ...p, value: p.score }))} metric="score" name="Day scores" /></details>}
  </section>;
}

function ReadingSelect({ id, label, value, onChange, exclude }: { id: string; label: string; value: ReadingId; onChange: (value: ReadingId) => void; exclude?: ReadingId }) {
  return <label className="mirror-field" htmlFor={id}>{label}<select id={id} value={value} onChange={(event) => onChange(event.target.value as ReadingId)}>{readingIds.filter((id) => id !== exclude).map((id) => <option key={id} value={id}>{readings[id].label}</option>)}</select></label>;
}

function RelationshipView({ relationship: r, first, second }: { relationship: Relationship; first: ReadingId; second: ReadingId }) {
  const [limit, setLimit] = useState(20);
  return <div className="relationship-result">
    <p className="eyebrow">Recorded · {r.pairs.length} paired {r.pairs.length === 1 ? 'check-in' : 'check-ins'} across {r.days} {r.days === 1 ? 'day' : 'days'}</p>
    <p className="association-number">{r.rho === null ? r.reason === 'too-few' ? 'A few more reference points' : 'No variation to compare' : `Rank association ${r.rho > 0 ? '+' : ''}${r.rho.toFixed(2)}`}</p>
    <p className="secondary">{r.reason === 'too-few' ? 'The description starts at three paired answers. That is only a display minimum, not enough to establish a pattern.' : r.reason === 'constant' ? 'At least one reading has the same phrase in every pair. A rank association cannot be calculated.' : 'Calculated · Spearman’s rank association. +1 means the phrase positions line up in the same order; −1 means opposite order; 0 means no rank association in this sample.'}</p>
    <p className="association-caution">Association, not causation. These are same-check-in pairings, not changes caused by one reading. Repeated days, routines, and time of day can shape the result.</p>
    <p className="secondary">{r.omitted} saved {r.omitted === 1 ? 'check-in in this time filter lacks one or both answers and is omitted' : 'check-ins in this time filter lack one or both answers and are omitted'}. Paired counts: {r.byBlock.morning} morning · {r.byBlock.afternoon} afternoon · {r.byBlock.evening} evening.</p>
    <details className="mirror-details"><summary>Inspect paired answers</summary>
      {!r.pairs.length && <p>Not logged yet. No saved check-in here contains both answers.</p>}
      <ol className="mirror-records" aria-label="Paired answers">{r.pairs.slice(0, limit).map((pair) => <li key={pair.id}><span><time dateTime={pair.at}>{stamp(pair.at)}</time> · {titleCase(pair.block)}</span><strong>{readings[first].label}: {readings[first].anchors[pair.first]}</strong><strong>{readings[second].label}: {readings[second].anchors[pair.second]}</strong></li>)}</ol>
      {r.pairs.length > limit && <button className="text-button" onClick={() => setLimit(limit + 20)}>Show 20 more pairs</button>}
    </details>
    <details className="mirror-details"><summary>How to read this</summary><p>Only answered pairs from the last 28 local dates enter the calculation. Each pair has equal weight; tied phrases receive average ranks. The original phrase order is used, including stress and irritation. No exact sleep hours are inferred.</p><p>This descriptive number does not meet the app’s bar for a reliable finding. There is no significance test, prediction, or claim about what helps here.</p><p>Three daily check-ins give about 90 observations a month across everything. Some findings take months; some remain uncertain.</p><a className="text-button" href="https://stat.ethz.ch/R-manual/R-devel/library/stats/html/cor.html" target="_blank" rel="noopener noreferrer">Method reference: R’s correlation documentation ↗</a></details>
  </div>;
}

export function Mirror({ records, loaded, error }: { records: CheckIn[]; loaded: boolean; error: string }) {
  const day = useLocalDay();
  const [period, setPeriod] = useState<'today' | 'week'>('today');
  const [metric, setMetric] = useState<Metric>('score');
  const [first, setFirst] = useState<ReadingId>('mood');
  const [second, setSecond] = useState<ReadingId>('energy');
  const [block, setBlock] = useState<MirrorQuery['block']>('all');
  const query = useMemo(() => ({ day, metric, first, second, block }), [day, metric, first, second, block]);
  const state = useMirror(records, query);
  return <>
    <div className="page-heading mirror-heading"><p className="eyebrow">Your own record</p><h1>Mirror</h1><p className="secondary">A little perspective, from what you chose to log.</p></div>
    {error ? <p role="alert">{error}</p> : !loaded ? <p role="status">Opening your readings…</p> : <>
      <div className="mirror-controls">
        <div className="mirror-period" role="group" aria-label="Trace period">{(['today', 'week'] as const).map((p) => <button key={p} aria-pressed={period === p} onClick={() => setPeriod(p)}>{titleCase(p)}</button>)}</div>
        <label className="mirror-field" htmlFor="trace-reading">Trace reading<select id="trace-reading" value={metric} onChange={(event) => setMetric(event.target.value as Metric)}><option value="score">Fixed score</option>{readingIds.map((id) => <option key={id} value={id}>{readings[id].label}</option>)}</select></label>
      </div>
      {state?.error ? <p role="alert">This view could not be calculated. Your saved readings are still available in Readings. Reopen Mirror to try again.</p> : state?.result ? <>
        <Trace days={state.result.days} metric={metric} period={period} />
        <Heatmap days={state.result.days} />
      </> : <p role="status">Calculating this view on your device…</p>}
      <section className="mirror-card" aria-labelledby="relationship-title">
        <p className="eyebrow">Calculated · descriptive only</p><h2 id="relationship-title">Readings together</h2>
        <p className="secondary">{dateLabel(state?.result?.days[0].day ?? day)} – {dateLabel(day)} · choose a pair to inspect.</p>
        <div className="relationship-fields"><ReadingSelect id="pair-first" label="First reading" value={first} exclude={second} onChange={setFirst} /><ReadingSelect id="pair-second" label="Second reading" value={second} exclude={first} onChange={setSecond} /></div>
        <label className="mirror-field" htmlFor="pair-block">Time filter<select id="pair-block" value={block} onChange={(event) => setBlock(event.target.value as MirrorQuery['block'])}><option value="all">All check-in blocks</option>{blocks.map((b) => <option key={b} value={b}>{titleCase(b)} only</option>)}</select></label>
        {state?.result && <RelationshipView key={`${first}-${second}-${block}`} relationship={state.result.relationship} first={first} second={second} />}
      </section>
      <a className="text-button" href="#/readings">Open saved readings to correct, delete, or export →</a>
      <p className="quiet-note">The mirror uses your saved reading answers. It does not fill gaps or change your score recipe.</p>
    </>}
  </>;
}

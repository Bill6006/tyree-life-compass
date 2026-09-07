import { localDay } from './preferences';
import { score, type Answers, type Anchor, type Block, type CheckIn, type ReadingId } from './readings';

export type MirrorRecord = Pick<CheckIn, 'id' | 'occurredAt' | 'block' | 'answers'>;
export type Metric = 'score' | ReadingId;
export type MirrorQuery = { day: string; metric: Metric; first: ReadingId; second: ReadingId; block: Block | 'all' };
export type TracePoint = { id: string; at: string; block: Block; value: number | null; score: number | null };
export type MirrorDay = { day: string; points: TracePoint[]; complete: number; incomplete: number; average: number | null };
export type Pair = { id: string; at: string; block: Block; first: Anchor; second: Anchor };
export type Relationship = { pairs: Pair[]; omitted: number; days: number; byBlock: Record<Block, number>; rho: number | null; reason: 'too-few' | 'constant' | null };
export type MirrorResult = { days: MirrorDay[]; relationship: Relationship };

// Local calendar arithmetic deliberately avoids adding 24 hours across DST changes.
export function shiftDay(day: string, offset: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return localDay(new Date(year, month - 1, date + offset, 12).toISOString());
}
export function dayDate(day: string): Date { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 12); }
export function metricValue(answers: Answers, metric: Metric): number | null {
  return metric === 'score' ? score(answers) : answers[metric] === undefined ? null : answers[metric]! * 25;
}

function ranks(values: number[]): number[] {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result: number[] = [];
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end].value === sorted[start].value) end++;
    const rank = (start + end - 1) / 2;
    for (let i = start; i < end; i++) result[sorted[i].index] = rank;
    start = end;
  }
  return result;
}
// Spearman = Pearson correlation of within-pair ranks; tied anchors share average ranks.
// Descriptive only: no p-values, significance decisions, causal or personal benefit claims.
export function rankCorrelation(pairs: Pick<Pair, 'first' | 'second'>[]): number | null {
  if (pairs.length < 3) return null;
  const x = ranks(pairs.map((p) => p.first)), y = ranks(pairs.map((p) => p.second));
  const mean = (pairs.length - 1) / 2;
  let xy = 0, xx = 0, yy = 0;
  for (let i = 0; i < pairs.length; i++) { const a = x[i] - mean, b = y[i] - mean; xy += a * b; xx += a * a; yy += b * b; }
  return xx === 0 || yy === 0 ? null : Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy)));
}

export function buildMirror(records: MirrorRecord[], query: MirrorQuery): MirrorResult {
  const dates = Array.from({ length: 28 }, (_, i) => shiftDay(query.day, i - 27));
  const grouped = new Map(dates.map((day) => [day, [] as MirrorRecord[]]));
  for (const record of records) grouped.get(localDay(record.occurredAt))?.push(record);
  const sorted = dates.flatMap((day) => grouped.get(day)!.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id)));
  const eligible = sorted.filter((r) => query.block === 'all' || r.block === query.block);
  const pairs: Pair[] = eligible.flatMap((r) => {
    const first = r.answers[query.first], second = r.answers[query.second];
    return first === undefined || second === undefined ? [] : [{ id: r.id, at: r.occurredAt, block: r.block, first, second }];
  });
  const rho = rankCorrelation(pairs);
  const byBlock = { morning: 0, afternoon: 0, evening: 0 };
  for (const pair of pairs) byBlock[pair.block]++;
  return {
    days: dates.map((day) => {
      const items = grouped.get(day)!;
      const complete = items.map((r) => score(r.answers)).filter((value): value is number => value !== null);
      return { day, points: items.map((r) => ({ id: r.id, at: r.occurredAt, block: r.block, value: metricValue(r.answers, query.metric), score: score(r.answers) })),
        complete: complete.length, incomplete: items.length - complete.length,
        average: complete.length ? complete.reduce((sum, value) => sum + value, 0) / complete.length : null };
    }),
    relationship: { pairs, omitted: eligible.length - pairs.length, days: new Set(pairs.map((p) => localDay(p.at))).size,
      byBlock, rho, reason: pairs.length < 3 ? 'too-few' : rho === null ? 'constant' : null },
  };
}

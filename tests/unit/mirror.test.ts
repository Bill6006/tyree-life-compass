import { expect, test } from 'vitest';
import { buildMirror, metricValue, rankCorrelation, shiftDay, type MirrorQuery, type MirrorRecord } from '../../src/mirror';
import { type Answers } from '../../src/readings';

const query: MirrorQuery = { day: '2026-09-07', metric: 'score', first: 'mood', second: 'energy', block: 'all' };
function r(day: string, answers: Answers, block: MirrorRecord['block'] = 'morning', hour = 8): MirrorRecord {
  return { id: crypto.randomUUID(), occurredAt: new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).toISOString(), block, answers };
}
const middle: Answers = { mood: 2, energy: 2, irritation: 2, stress: 2 };

test('empty days stay null, including dates over month, leap-year and daylight-saving boundaries', () => {
  const result = buildMirror([], query);
  expect(result.days).toHaveLength(28);
  expect(result.days[0].day).toBe('2026-08-11');
  expect(result.days.at(-1)!.day).toBe(query.day);
  expect(result.days.every((d) => d.average === null && !d.points.length && !d.complete && !d.incomplete)).toBe(true);
  expect(result.relationship).toMatchObject({ pairs: [], omitted: 0, days: 0, rho: null, reason: 'too-few' });
  expect(shiftDay('2024-03-01', -1)).toBe('2024-02-29');
  expect(shiftDay('2026-03-09', -1)).toBe('2026-03-08');
  expect(shiftDay('2026-11-02', -1)).toBe('2026-11-01');
});

test('mean counts only complete scores; zero is observed, silence is null, and gaps are preserved', () => {
  const result = buildMirror([
    r(query.day, middle), r(query.day, { mood: 0, energy: 0, irritation: 4, stress: 4 }),
    r(query.day, { mood: 4 }), r('2026-08-10', middle), r('2026-09-08', middle),
  ], query);
  expect(result.days.at(-1)).toMatchObject({ average: 25, complete: 2, incomplete: 1 });
  expect(result.days.at(-1)!.points.map((p) => p.value).sort()).toEqual([0, 50, null]);
  expect(result.days.slice(0, -1).every((d) => d.average === null)).toBe(true);
  expect(result.relationship.pairs).toHaveLength(2);
  expect(result.relationship.omitted).toBe(1);
});

test('uses occurrence dates in local time, not reporting time, and includes both ends of the date window', () => {
  const records = [r('2026-08-11', middle, 'morning', 0), r(query.day, middle, 'evening', 23)];
  const result = buildMirror(records.reverse(), query);
  expect(result.days[0].points).toHaveLength(1);
  expect(result.days.at(-1)!.points).toHaveLength(1);
  expect(result.relationship.pairs.map((p) => p.at)).toEqual([...records.map((p) => p.occurredAt)].sort());
});

test('correction and deletion rebuild every dependent mean, pair and count from current records', () => {
  const a = r(query.day, middle), b = r('2026-09-06', { mood: 0, energy: 0, irritation: 0, stress: 0 });
  const before = buildMirror([a, b], query);
  expect(before.days.at(-1)!.average).toBe(50);
  const corrected = { ...a, answers: { ...a.answers, mood: 4 as const } };
  expect(buildMirror([corrected, b], query).days.at(-1)!.average).toBe(62.5);
  expect(buildMirror([corrected, b], query).relationship.pairs.at(-1)!.first).toBe(4);
  const after = buildMirror([b], query);
  expect(after.days.at(-1)!.average).toBeNull();
  expect(after.relationship.pairs).toHaveLength(1);
  expect(buildMirror([], query).relationship.days).toBe(0);
});

test('pairwise omission never borrows an answer from another time or a different reading', () => {
  const rows = [r(query.day, { mood: 0 }), r(query.day, { energy: 4 }), r(query.day, { mood: 1, energy: 1 }), r(query.day, { mood: 2, focus: 2 }), r(query.day, { mood: 3, energy: 3 })];
  const result = buildMirror(rows, query);
  expect(result.relationship).toMatchObject({ omitted: 3, days: 1, rho: null });
  expect(result.relationship.pairs).toHaveLength(2);
  expect(buildMirror(rows, { ...query, second: 'focus' }).relationship.pairs).toHaveLength(1);
});

test('time filters change only the pair sample, preserving heatmap and traces', () => {
  const rows = [r(query.day, middle), r(query.day, middle, 'afternoon', 14), r(query.day, middle, 'evening', 20)];
  const all = buildMirror(rows, query), morning = buildMirror(rows, { ...query, block: 'morning' });
  expect(all.relationship.byBlock).toEqual({ morning: 1, afternoon: 1, evening: 1 });
  expect(morning.relationship.pairs).toHaveLength(1);
  expect(morning.days).toEqual(all.days);
});

test('rank association handles tied ordinal readings, opposing order, constants and too few pairs', () => {
  const pairs = [{ first: 0, second: 0 }, { first: 0, second: 1 }, { first: 1, second: 1 }, { first: 2, second: 2 }] as const;
  // Average ranks [1.5,1.5,3,4] vs [1,2.5,2.5,4]: covariance sum 3.75, both squared sums 4.5.
  expect(rankCorrelation([...pairs])).toBeCloseTo(5 / 6, 12);
  expect(rankCorrelation([{ first: 0, second: 4 }, { first: 2, second: 2 }, { first: 4, second: 0 }])).toBe(-1);
  expect(rankCorrelation([{ first: 0, second: 0 }, { first: 2, second: 2 }, { first: 4, second: 4 }])).toBe(1);
  expect(rankCorrelation([{ first: 2, second: 0 }, { first: 2, second: 2 }, { first: 2, second: 4 }])).toBeNull();
  expect(rankCorrelation([{ first: 0, second: 0 }, { first: 4, second: 4 }])).toBeNull();
});

test('context chart positions preserve anchor order and sleep ranges without changing heatmap scores', () => {
  expect(metricValue({ irritation: 4 }, 'irritation')).toBe(100);
  expect(metricValue({ sleepDuration: 3 }, 'sleepDuration')).toBe(75);
  expect(metricValue({}, 'sleepDuration')).toBeNull();
  const result = buildMirror([r(query.day, { ...middle, sleepDuration: 3 })], { ...query, metric: 'sleepDuration' });
  expect(result.days.at(-1)!.points[0]).toMatchObject({ value: 75, score: 50 });
  expect(result.days.at(-1)!.average).toBe(50);
});

test('extras and unrelated fields cannot enter descriptive results', () => {
  const extra = { ...r(query.day, middle), evening: { minimumWin: 'Test-only note', closeToGod: true }, privateName: 'Test-only hidden name' };
  const result = JSON.stringify(buildMirror([extra], query));
  expect(result).not.toMatch(/Test-only|closeToGod|minimumWin|privateName/);
});

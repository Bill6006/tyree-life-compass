import { blocks, currentBlock, type Block } from './readings';
export type Preferences = {
  key: 'preferences'; depth: 'standard' | 'brief'; frequency: 0 | 1 | 2 | 3; lowDemand: boolean;
  quietStart: string; quietEnd: string; times: Record<Block, string>; faithEnabled: boolean; privateEnabled: boolean;
};
export const defaults: Preferences = { key: 'preferences', depth: 'standard', frequency: 3, lowDemand: false,
  quietStart: '22:00', quietEnd: '07:00', times: { morning: '08:00', afternoon: '14:00', evening: '21:00' }, faithEnabled: false, privateEnabled: false };
export function effectiveDepth(p: Preferences) { return p.lowDemand ? 'brief' : p.depth; }
export function plannedBlocks(p: Preferences): Block[] {
  const n = p.lowDemand ? 1 : p.frequency;
  return n === 0 ? [] : n === 1 ? ['evening'] : n === 2 ? ['morning', 'evening'] : [...blocks];
}
export const validTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export function inQuietHours(time: string, p: Preferences): boolean {
  return p.quietStart === p.quietEnd ? false : p.quietStart < p.quietEnd ? time >= p.quietStart && time < p.quietEnd : time >= p.quietStart || time < p.quietEnd;
}
export function alarmPlan(p: Preferences) { return plannedBlocks(p).filter((block) => !inQuietHours(p.times[block], p)).map((block) => ({ block, time: p.times[block] })); }
export function preferredBlock(p: Preferences, now = new Date()): Block {
  const planned = plannedBlocks(p); const current = currentBlock(now);
  return planned.includes(current) || !planned.length ? current : planned[planned.length - 1];
}
export function publicPreferences(p: Preferences): Omit<Preferences, 'privateEnabled'> {
  return { key: 'preferences', depth: p.depth, frequency: p.frequency, lowDemand: p.lowDemand, quietStart: p.quietStart, quietEnd: p.quietEnd,
    times: { morning: p.times.morning, afternoon: p.times.afternoon, evening: p.times.evening }, faithEnabled: p.faithEnabled };
}
export function localDay(iso = new Date().toISOString()) { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

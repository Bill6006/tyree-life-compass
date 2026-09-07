export type Anchor = 0 | 1 | 2 | 3 | 4;
type Definition = { label: string; prompt: string; anchors: readonly [string, string, string, string, string] };
export const readings = {
  mood: { label: 'Mood', prompt: 'What does life feel like right now?', anchors: ['Heavy — enjoyment feels far away', 'Low — little feels appealing', 'Flat — nothing wrong, nothing good', 'Light — ordinary things feel pleasant', 'Joyful — I want to share this feeling'] },
  irritation: { label: 'Irritation', prompt: 'How easily are things getting under your skin?', anchors: ['Unruffled — small annoyances pass me by', 'Prickly — I notice annoyances, then let them go', 'Edgy — little things keep bothering me', 'Frayed — I have to work to hold my temper', 'At the edge — almost anything could set me off'] },
  stress: { label: 'Stress', prompt: 'How much pressure are you carrying?', anchors: ['At ease — I feel no pressure to act', 'A little pressure — I can carry it comfortably', 'Under pressure — tension keeps drawing my attention', 'Tense — it is hard to settle my body or thoughts', 'On high alert — the pressure feels constant'] },
  overwhelm: { label: 'Overwhelm', prompt: 'Can you find a way through what is in front of you?', anchors: ['Clear path — I can see what comes next', 'A few threads — I can keep track of them', 'Crowded — choosing where to start takes work', 'Too much at once — I keep losing my place', 'Swamped — I cannot find a starting point'] },
  motivation: { label: 'Motivation', prompt: 'How willing do you feel to begin something?', anchors: ['No pull — I do not want to begin anything', 'Reluctant — starting feels like a push', 'Willing with a nudge — a small start feels possible', 'Drawn in — I want to get going', 'Eager — I am ready to begin'] },
  confidence: { label: 'Confidence', prompt: 'How capable do you feel of handling what is ahead?', anchors: ['Doubting myself — I expect to struggle to cope', 'Unsure — I need reassurance about my ability', 'Some footing — I can handle familiar things', 'Trusting myself — I can work through a challenge', 'Self-assured — I trust myself with the unfamiliar'] },
  focus: { label: 'Focus', prompt: 'How well can your attention stay with one thing?', anchors: ['Scattered — I cannot stay with a thought', 'Slipping — my attention leaves almost immediately', 'Patchy — I stay with it for short stretches', 'Steady — I can return when distracted', 'Absorbed — my attention stays where I put it'] },
  loneliness: { label: 'Loneliness', prompt: 'How much are you missing connection?', anchors: ['Connected — I feel close enough to others', 'A little apart — I would welcome a familiar voice', 'Missing company — the distance is on my mind', 'Isolated — I feel unseen even around people', 'Aching for connection — the distance feels hard to carry'] },
  socialEnergy: { label: 'Social energy', prompt: 'How much capacity do you have for company?', anchors: ['Need solitude — conversation feels like too much', 'A little room — a brief hello is enough', 'Selective — I have room for one easy exchange', 'Open to company — I can enjoy a conversation', 'Ready to connect — I want to spend time talking'] },
  energy: { label: 'Energy', prompt: 'How much physical fuel do you feel you have?', anchors: ['Drained — even small movements feel heavy', 'Low fuel — I can manage the essentials', 'Enough — I can move through ordinary tasks', 'Lively — I have some energy to spare', 'Full of energy — I feel ready to be active'] },
  hunger: { label: 'Hunger', prompt: 'What is your body saying about food?', anchors: ['Full — more food feels uncomfortable', 'Satisfied — I am comfortable without food', 'Ready soon — I notice a little appetite', 'Hungry — I would like to eat now', 'Very hungry — food is hard to put out of mind'] },
  sleepDuration: { label: 'Sleep duration', prompt: 'About how long did you sleep last night?', anchors: ['A short stretch — under 4 hours', 'Several hours — 4 to under 6 hours', 'Much of the night — 6 to under 7 hours', 'A long stretch — 7 to under 9 hours', 'An extended sleep — 9 hours or more'] },
  sleepQuality: { label: 'Sleep quality', prompt: 'How restful did last night feel?', anchors: ['Unrested — sleep brought almost no relief', 'Restless — I woke feeling barely restored', 'Mixed — some rest, some unsettled stretches', 'Restful — I woke feeling mostly restored', 'Deeply rested — I woke feeling fully refreshed'] },
} as const satisfies Record<string, Definition>;

export type ReadingId = keyof typeof readings;
export type Answers = Partial<Record<ReadingId, Anchor>>;
export type Block = 'morning' | 'afternoon' | 'evening';
export const blocks: Block[] = ['morning', 'afternoon', 'evening'];
export const readingIds = Object.keys(readings) as ReadingId[];
export const coreIds: ReadingId[] = ['mood', 'energy', 'irritation', 'stress'];
export const definitionVersion = 1;
export const scoreVersion = 'core-four-v1';
export function questionsFor(block: Block): ReadingId[] {
  return block === 'morning' ? readingIds : ['mood', 'irritation', 'energy', 'hunger', 'stress'];
}
export function currentBlock(date = new Date()): Block {
  const hour = date.getHours();
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
}
export function score(answers: Answers): number | null {
  if (coreIds.some((id) => answers[id] === undefined)) return null;
  return coreIds.reduce((sum, id) => sum + (id === 'irritation' || id === 'stress' ? 4 - answers[id]! : answers[id]!) * 25, 0) / 4;
}
export function formatScore(value: number): string { return Number(value.toFixed(2)).toString(); }
export function titleCase(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }

export type CheckIn = {
  id: string; block: Block; occurredAt: string; reportedAt: string; updatedAt: string;
  answers: Answers; definitionVersion: 1; scoreVersion: typeof scoreVersion;
  answeringMs: number;
};
export type Draft = {
  key: 'active'; id: string; revision: number; block: Block; occurredAt: string;
  answers: Answers; index: number; answeringMs: number;
  editingId: string | null; editingUpdatedAt: string | null;
};
export function newDraft(block: Block, record?: CheckIn): Draft {
  return { key: 'active', id: crypto.randomUUID(), revision: 0, block, occurredAt: record?.occurredAt ?? new Date().toISOString(),
    answers: record ? { ...record.answers } : {}, index: 0, answeringMs: 0,
    editingId: record?.id ?? null, editingUpdatedAt: record?.updatedAt ?? null };
}

export type Comparison = { id: ReadingId; previous: Anchor; previousAt: string; current: Anchor; delta: number };
export type Summary = {
  score: number | null; missing: ReadingId[]; lastComplete: { score: number; at: string } | null;
  comparisons: Comparison[]; context: { id: ReadingId; value: Anchor; at: string }[];
};
export function summarize(record: CheckIn, history: CheckIn[]): Summary {
  const previous = history.filter((item) => item.id !== record.id && item.occurredAt < record.occurredAt)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.reportedAt.localeCompare(a.reportedAt));
  const full = previous.find((item) => score(item.answers) !== null);
  const comparisons = readingIds.flatMap((id): Comparison[] => {
    const current = record.answers[id];
    const prior = previous.find((item) => item.answers[id] !== undefined);
    return current === undefined || !prior ? [] : [{ id, previous: prior.answers[id]!, previousAt: prior.occurredAt, current, delta: (current - prior.answers[id]!) * 25 }];
  });
  return { score: score(record.answers), missing: coreIds.filter((id) => record.answers[id] === undefined),
    lastComplete: full ? { score: score(full.answers)!, at: full.occurredAt } : null, comparisons,
    context: readingIds.filter((id) => !coreIds.includes(id)).flatMap((id) => {
      const item = [record, ...previous].find((item) => item.answers[id] !== undefined);
      return item ? [{ id, value: item.answers[id]!, at: item.occurredAt }] : [];
    }) };
}

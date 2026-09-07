export type Commitment = { id: string; title: string; nextStep: string; stopWhen: string; isStudy: boolean; createdAt: string; updatedAt: string; revision: number };
export type Sitting = { id: string; commitmentId: string; title: string; step: string; stopWhen: string; isStudy: boolean; startedOn: string; finishedOn: string | null; reportedAt: string; updatedAt: string; revision: number };
export const activityLabels = { 'study-resumed': 'Study sessions resumed', conversation: 'Conversations started', 'daughter-time': 'Time with my daughter', faith: 'Faith practices I chose' } as const;
export type ActivityKind = keyof typeof activityLabels;
export type LifeActivity = { id: string; kind: ActivityKind; day: string; note: string; sittingId: string | null; reportedAt: string; updatedAt: string; revision: number };
export type BecomingProfile = { key: 'becoming'; direction: string; protectedId: string | null; studyEvenings: boolean; churchSaturday: boolean; revision: number };
export const becomingDefaults: BecomingProfile = { key: 'becoming', direction: '', protectedId: null, studyEvenings: true, churchSaturday: true, revision: 0 };
export type BecomingData = { commitments: Commitment[]; sittings: Sitting[]; activities: LifeActivity[]; profile: BecomingProfile };
export type BecomingCounts = { started: number; finished: number; activities: Record<ActivityKind, number>; firstDay: string | null; lastDay: string | null };

// This selector has no state reading or comfort score input. Only an explicit choice changes it.
export function protectedCommitment(data: Pick<BecomingData, 'profile' | 'commitments'>): Commitment | undefined {
  return data.commitments.find((c) => c.id === data.profile.protectedId);
}
export function becomingCounts(sittings: Sitting[], activities: LifeActivity[], faithEnabled: boolean): BecomingCounts {
  const visible = activities.filter((a) => a.kind !== 'faith' || faithEnabled);
  const counts: BecomingCounts['activities'] = { 'study-resumed': 0, conversation: 0, 'daughter-time': 0, faith: 0 };
  visible.forEach((a) => counts[a.kind]++);
  const days = [...sittings.flatMap((s) => [s.startedOn, ...(s.finishedOn ? [s.finishedOn] : [])]), ...visible.map((a) => a.day)].sort();
  return { started: sittings.length, finished: sittings.filter((s) => s.finishedOn !== null).length, activities: counts, firstDay: days[0] ?? null, lastDay: days.at(-1) ?? null };
}

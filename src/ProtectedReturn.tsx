import type { AppDatabase } from './storage';
import { protectedCommitment } from './becomingTypes';
import { useBecoming } from './useBecoming';

export function ProtectedReturn({ database }: { database: AppDatabase }) {
  const data = useBecoming(database), commitment = protectedCommitment(data);
  if (!data.loaded || data.error || !commitment) return null;
  const sitting = data.sittings.find((s) => s.commitmentId === commitment.id && s.finishedOn === null);
  return <section className="protected-return" aria-label="Your protected return"><p className="eyebrow">Protect · chosen by you</p><h2>{commitment.title}</h2><p className="return-step">{sitting?.step ?? commitment.nextStep}</p><p className="secondary">Stop when: {sitting?.stopWhen ?? commitment.stopWhen}</p><a className="text-button" href="#/becoming">Return to this step →</a></section>;
}

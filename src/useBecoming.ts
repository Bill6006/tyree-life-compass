import { liveQuery } from 'dexie';
import { useEffect, useMemo, useState } from 'react';
import type { AppDatabase } from './storage';
import { becomingDefaults, type BecomingCounts, type BecomingData } from './becomingTypes';

export function useBecoming(db: AppDatabase) {
  const [state, setState] = useState<BecomingData & { loaded: boolean; error: string }>({ commitments: [], sittings: [], activities: [], profile: becomingDefaults, loaded: false, error: '' });
  useEffect(() => {
    const sub = liveQuery(() => db.transaction('r', db.commitments, db.sittings, db.lifeActivities, db.becomingProfile, async () => ({ commitments: await db.commitments.toArray(), sittings: await db.sittings.orderBy('startedOn').reverse().toArray(), activities: await db.lifeActivities.orderBy('day').reverse().toArray(), profile: await db.becomingProfile.get('becoming') ?? becomingDefaults })))
      .subscribe({ next: (data) => setState({ ...data, loaded: true, error: '' }), error: () => setState((old) => ({ ...old, loaded: true, error: 'These records could not be opened. Check storage in About.' })) });
    return () => sub.unsubscribe();
  }, [db]);
  return state;
}
export function useBecomingCounts(data: BecomingData, faithEnabled: boolean) {
  const input = useMemo(() => ({ sittings: data.sittings, activities: data.activities, faithEnabled }), [data.sittings, data.activities, faithEnabled]);
  const [state, setState] = useState<{ input: typeof input; result?: BecomingCounts; error?: boolean } | null>(null);
  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./becoming.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<BecomingCounts>) => setState({ input, result: event.data });
      worker.onerror = () => setState({ input, error: true });
      worker.postMessage(input);
    } catch { setState({ input, error: true }); }
    return () => worker?.terminate();
  }, [input]);
  return state?.input === input ? state : null;
}

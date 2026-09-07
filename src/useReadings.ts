import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { type CheckIn, type Draft, type Summary } from './readings';
import { AppDatabase } from './storage';

export function useRecords(database: AppDatabase) {
  const [state, setState] = useState<{ records: CheckIn[]; draft: Draft | null; loaded: boolean; error: string }>({ records: [], draft: null, loaded: false, error: '' });
  useEffect(() => {
    const subscription = liveQuery(() => database.transaction('r', database.checkIns, database.drafts, async () => ({
      records: await database.checkIns.orderBy('occurredAt').reverse().toArray(), draft: await database.drafts.get('active') ?? null,
    }))).subscribe({ next: (data) => setState({ ...data, loaded: true, error: '' }), error: () => setState((old) => ({ ...old, loaded: true, error: 'Records are unavailable in this browser. Nothing has been added.' })) });
    return () => subscription.unsubscribe();
  }, [database]);
  return state;
}
export function useSummary(record: CheckIn | undefined, history: CheckIn[]) {
  const [state, setState] = useState<{ record: CheckIn; history: CheckIn[]; summary: Summary } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!record) return;
    setError(false);
    let worker: Worker;
    try {
      worker = new Worker(new URL('./calculations.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<{ summary: Summary }>) => setState({ record, history, summary: event.data.summary });
      worker.onerror = () => setError(true);
      worker.postMessage({ id: 1, record, history });
    } catch { setError(true); }
    return () => worker?.terminate();
  }, [record, history]);
  return { summary: state && state.record === record && state.history === history ? state.summary : null, error };
}

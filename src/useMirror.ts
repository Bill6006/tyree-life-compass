import { useEffect, useMemo, useState } from 'react';
import type { CheckIn } from './readings';
import type { MirrorQuery, MirrorResult } from './mirror';
import { localDay } from './preferences';

export function useLocalDay(): string {
  const [day, setDay] = useState(() => localDay(new Date().toISOString()));
  useEffect(() => {
    const update = () => setDay(localDay(new Date().toISOString()));
    const timer = window.setInterval(update, 30_000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, []);
  return day;
}

export function useMirror(records: CheckIn[], query: MirrorQuery) {
  // Only ordinary reading fields cross into this worker; extras and private tables are excluded.
  const input = useMemo(() => ({ records: records.map(({ id, occurredAt, block, answers }) => ({ id, occurredAt, block, answers })), query }), [records, query]);
  const [state, setState] = useState<{ input: typeof input; result?: MirrorResult; error?: boolean } | null>(null);
  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./mirror.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<MirrorResult>) => setState({ input, result: event.data });
      worker.onerror = () => setState({ input, error: true });
      worker.postMessage(input);
    } catch { setState({ input, error: true }); }
    return () => worker?.terminate();
  }, [input]);
  return state?.input === input ? state : null;
}

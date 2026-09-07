import { summarize, type CheckIn } from './readings';
self.onmessage = (event: MessageEvent<{ id: number; record: CheckIn; history: CheckIn[] }>) => {
  const { id, record, history } = event.data;
  self.postMessage({ id, summary: summarize(record, history) });
};

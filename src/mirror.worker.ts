import { buildMirror, type MirrorQuery, type MirrorRecord } from './mirror';
self.onmessage = (event: MessageEvent<{ records: MirrorRecord[]; query: MirrorQuery }>) => {
  self.postMessage(buildMirror(event.data.records, event.data.query));
};

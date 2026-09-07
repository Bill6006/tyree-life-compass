import { becomingCounts, type LifeActivity, type Sitting } from './becomingTypes';
self.onmessage = (event: MessageEvent<{ sittings: Sitting[]; activities: LifeActivity[]; faithEnabled: boolean }>) => {
  self.postMessage(becomingCounts(event.data.sittings, event.data.activities, event.data.faithEnabled));
};

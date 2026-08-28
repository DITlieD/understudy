import type { Bus, Catalogue } from "../bus";
import { assertRecordable } from "../safety";

export function createGuardedBus(inner: Bus, catalogue: Catalogue, isRecording: () => boolean): Bus {
  return {
    dispatch(commandId, payload) {
      if (isRecording()) {
        assertRecordable(catalogue.get(commandId));
      }
      return inner.dispatch(commandId, payload);
    },
    subscribe: inner.subscribe.bind(inner),
  };
}

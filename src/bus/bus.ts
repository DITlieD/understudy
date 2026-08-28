import type { BusListener, CommandResult, JsonSchema } from "../model/types";
import type { Catalogue } from "./catalogue";

export type Bus = {
  dispatch: (commandId: string, payload: Record<string, unknown>) => CommandResult;
  subscribe: (listener: BusListener) => () => void;
};

export function createBus(catalogue: Catalogue): Bus {
  const listeners = new Set<BusListener>();
  return {
    dispatch(commandId: string, payload: Record<string, unknown>) {
      const command = catalogue.get(commandId);
      assertPayload(command.payloadSchema, payload);
      const result = command.handle(payload);
      const event = {
        commandId,
        payload,
        result,
        mutates: command.mutates,
      };
      for (const listener of listeners) {
        listener(event);
      }
      return result;
    },
    subscribe(listener: BusListener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function assertPayload(schema: JsonSchema, payload: Record<string, unknown>) {
  for (const key of schema.required ?? []) {
    if (payload[key] === undefined) {
      throw new Error(`missing required field: ${key}`);
    }
  }
}

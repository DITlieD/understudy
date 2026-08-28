import type { Bus } from "../bus";
import type { Binding, CommandResult, ProcedureDraft } from "../model/types";
import { bindPayload } from "./bind";
import { compactSummary } from "./summary";
import type { CompiledTool, StepOutcome } from "./types";

export function createExecute(draft: ProcedureDraft, bus: Bus): CompiledTool["execute"] {
  const allowed = new Set(draft.steps.map((item) => item.commandId));
  const steps = draft.steps.map((item) => ({
    index: item.index,
    commandId: item.commandId,
    payload: { ...item.payload },
  }));
  const bindings: Binding[] = draft.bindings.map((item) => ({ ...item }));
  const requiredKeys = draft.parameters.filter((item) => item.required).map((item) => item.key);

  return async (input, extras) => {
    for (const key of requiredKeys) {
      if (input[key] === undefined) {
        throw new Error(`missing required argument: ${key}`);
      }
    }
    const results: CommandResult[] = [];
    const outcomes: StepOutcome[] = [];
    for (const item of steps) {
      throwIfAborted(extras.signal);
      if (!allowed.has(item.commandId)) {
        throw new Error(`command not in recording: ${item.commandId}`);
      }
      const payload = bindPayload(item.payload, item.index, bindings, input, results);
      try {
        const result = bus.dispatch(item.commandId, payload);
        results[item.index] = result;
        outcomes.push({
          index: item.index,
          commandId: item.commandId,
          ok: result.ok,
          summary: result.summary,
        });
        if (!result.ok) break;
      } catch (err) {
        if (isAbort(err)) throw err;
        outcomes.push({
          index: item.index,
          commandId: item.commandId,
          ok: false,
          summary: err instanceof Error ? err.message : String(err),
        });
        break;
      }
    }
    return compactSummary(outcomes);
  };
}

function throwIfAborted(signal: AbortSignal) {
  if (!signal.aborted) return;
  const reason = signal.reason;
  if (reason instanceof Error) throw reason;
  throw new Error("aborted");
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || /abort/i.test(err.message));
}

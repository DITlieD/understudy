import type { Bus, Catalogue } from "../bus";
import { compile } from "../compiler";
import type { Persistence } from "../persist";
import type { ExecuteFor } from "../registry";
import type { ExecutionLive } from "../ui";
import { applyProvenanceBadges } from "./badges";

export function wrapExecuteFor(deps: {
  catalogue: Catalogue;
  bus: Bus;
  persist: Persistence;
  live: ExecutionLive;
  badges: Map<string, string>;
  ping: () => void;
}): ExecuteFor {
  return (procedure) => async (input, extras) => {
    deps.live.toolName = procedure.name;
    deps.live.steps = procedure.steps;
    deps.live.currentIndex = null;
    deps.ping();
    let stepIndex = 0;
    const mutated = new Set<string>();
    const wrapped: Bus = {
      dispatch(commandId, payload) {
        deps.live.currentIndex = stepIndex;
        stepIndex += 1;
        deps.ping();
        if (deps.catalogue.get(commandId).mutates) {
          const ticketId = payload["ticketId"];
          if (typeof ticketId === "string") {
            mutated.add(ticketId);
          }
        }
        const result = deps.bus.dispatch(commandId, payload);
        markLiveRow(payload);
        return result;
      },
      subscribe: deps.bus.subscribe.bind(deps.bus),
    };
    const compiled = compile(procedure, deps.catalogue, { bus: wrapped });
    try {
      const text = await compiled.execute(input, extras);
      const parsed = JSON.parse(text) as { ok: boolean; error?: unknown };
      procedure.invocationCount += 1;
      if (parsed.ok) {
        procedure.successCount += 1;
        procedure.lastError = null;
      } else {
        procedure.lastError = typeof parsed.error === "string" ? parsed.error : text;
      }
      await deps.persist.published.save(procedure);
      for (const ticketId of mutated) {
        deps.badges.set(ticketId, procedure.name);
      }
      deps.ping();
      applyProvenanceBadges(deps.badges);
      return text;
    } finally {
      clearLiveRows();
      deps.live.toolName = null;
      deps.live.currentIndex = null;
      deps.ping();
    }
  };
}

function markLiveRow(payload: Record<string, unknown>) {
  clearLiveRows();
  const ticketId = payload["ticketId"];
  if (typeof ticketId !== "string") {
    return;
  }
  document.querySelector(`[data-ticket-id="${ticketId}"]`)?.classList.add("is-live");
}

function clearLiveRows() {
  document.querySelectorAll(".triage-row.is-live").forEach((node) => {
    node.classList.remove("is-live");
  });
}

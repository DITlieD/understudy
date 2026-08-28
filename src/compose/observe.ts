import type { Registry } from "../registry";
import {
  mountBudgetMeter,
  mountExecutionTrace,
  mountTeachingPanel,
  mountToolLibrary,
  type ExecutionLive,
  type TraceLive,
} from "../ui";

export function mountObservability(deps: {
  teaching: HTMLElement;
  library: HTMLElement;
  budget: HTMLElement;
  trace: HTMLElement;
  registry: Registry;
  live: TraceLive;
  execution: ExecutionLive;
  subscribe: (onChange: () => void) => () => void;
  ping: () => void;
  startReTeach: (name: string) => void;
  exportPack: () => void;
}) {
  mountTeachingPanel(deps.teaching, {
    getTraceLive: () => deps.live,
    subscribe: deps.subscribe,
  });
  mountToolLibrary(deps.library, {
    listTools: () =>
      deps.registry.list().map((procedure) => ({
        name: procedure.name,
        author: procedure.approvedBy,
        createdAt: procedure.publishedAt,
        invocationCount: procedure.invocationCount,
        successRate:
          procedure.invocationCount === 0
            ? 1
            : procedure.successCount / procedure.invocationCount,
        lastFailure: procedure.lastError,
        readWrite: procedure.computedAnnotations.readOnlyHint ? "read" : "write",
        enabled: deps.registry.isEnabled(procedure.name),
      })),
    revoke: (name) => {
      void deps.registry.revoke(name).then(deps.ping);
    },
    setEnabled: (name, enabled) => {
      void deps.registry.setEnabled(name, enabled).then(deps.ping);
    },
    reTeach: (name) => {
      deps.startReTeach(name);
    },
    exportPack: deps.exportPack,
    subscribe: deps.subscribe,
  });
  mountBudgetMeter(deps.budget, {
    getBudget: () => {
      const budget = deps.registry.getBudget();
      return { used: budget.used, cap: budget.cap };
    },
    subscribe: deps.subscribe,
  });
  mountExecutionTrace(deps.trace, {
    getExecution: () => deps.execution,
    subscribe: deps.subscribe,
  });
}

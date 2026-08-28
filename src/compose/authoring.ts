import type { Bus, Catalogue } from "../bus";
import { generalize, generalizeFromPair } from "../generalizer";
import type { ProcedureDraft, Trace } from "../model/types";
import type { Registry } from "../registry";
import { applyRepair, failingStepIndex } from "./repair";
import type { createTeachingSession } from "./session";

type Teaching = ReturnType<typeof createTeachingSession>;

export function createAuthoring(deps: {
  teaching: Teaching;
  catalogue: Catalogue;
  bus: Bus;
  registry: Registry;
  ping: () => void;
}) {
  let draft: ProcedureDraft | null = null;
  let primary: Trace | null = null;
  let pairing = false;
  let reteach: { name: string; stepIndex: number } | null = null;

  return {
    getDraft() {
      return draft;
    },
    startTeaching(label: string) {
      if (primary) {
        pairing = true;
        deps.teaching.startTeaching(primary.label);
        return;
      }
      deps.teaching.startTeaching(label);
    },
    startSecondDemo() {
      if (!primary) {
        throw new Error("no first demonstration");
      }
      pairing = true;
      deps.teaching.startTeaching(primary.label);
    },
    startReTeach(name: string) {
      const procedure = deps.registry.list().find((item) => item.name === name);
      if (!procedure) {
        throw new Error(`unknown tool: ${name}`);
      }
      if (!procedure.lastError) {
        throw new Error("tool has no failing step");
      }
      reteach = { name, stepIndex: failingStepIndex(procedure.lastError) };
      deps.teaching.startTeaching(name);
    },
    async stopTeaching() {
      const trace = await deps.teaching.stopTeaching();
      if (reteach) {
        const pending = reteach;
        reteach = null;
        await applyRepair({
          catalogue: deps.catalogue,
          bus: deps.bus,
          registry: deps.registry,
          pending,
          trace,
        });
        draft = null;
        deps.ping();
        return trace;
      }
      if (pairing) {
        pairing = false;
        if (!primary) {
          throw new Error("no first demonstration");
        }
        draft = generalizeFromPair(primary, trace, deps.catalogue);
        primary = null;
        deps.ping();
        return trace;
      }
      primary = trace;
      draft = generalize(trace, deps.catalogue);
      deps.ping();
      return trace;
    },
    dispose() {
      deps.teaching.dispose();
    },
  };
}

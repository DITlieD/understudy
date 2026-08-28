import { compile } from "../compiler";
import type { Bus, Catalogue } from "../bus";
import type { ProcedureDraft, Trace } from "../model/types";
import type { MetaPorts } from "../meta";
import { generalize } from "../generalizer";
import type { Persistence } from "../persist";
import type { Registry } from "../registry";
import type { ApprovalUi, Clock } from "../safety";
import { dryRunDraft } from "./dry-run";

export function createMetaPorts(deps: {
  catalogue: Catalogue;
  bus: Bus;
  traces: Map<string, Trace>;
  drafts: Map<string, ProcedureDraft>;
  persist: Persistence;
  registry: Registry;
  clock: Clock;
  approvalUi: ApprovalUi;
  ping: () => void;
}): MetaPorts {
  return {
    listTraces: () => [...deps.traces.values()],
    getTrace: (id) => deps.traces.get(id),
    proposeCandidates: (trace) => generalize(trace, deps.catalogue).parameters,
    createDraft: (input) => {
      const draft = generalize(input.trace, deps.catalogue);
      draft.name = input.name;
      draft.description = input.description;
      for (const parameter of draft.parameters) {
        const description = input.parameterDescriptions[parameter.key];
        if (description === undefined) {
          throw new Error(`missing parameter description: ${parameter.key}`);
        }
        parameter.description = description;
      }
      deps.drafts.set(draft.id, draft);
      void deps.persist.drafts.save(draft);
      return draft;
    },
    getDraft: (id) => deps.drafts.get(id),
    validate: (draft) => {
      try {
        compile(draft, deps.catalogue, { bus: deps.bus });
        return [];
      } catch (err) {
        return [err instanceof Error ? err.message : String(err)];
      }
    },
    dryRun: (draft) => dryRunDraft(draft),
    async register(draft, approvedBy) {
      const compiled = compile(draft, deps.catalogue, { bus: deps.bus });
      const published = {
        ...draft,
        computedAnnotations: compiled.annotations,
        publishedAt: new Date().toISOString(),
        approvedBy,
        registrationId: crypto.randomUUID(),
        invocationCount: 0,
        successCount: 0,
        lastError: null,
      };
      await deps.registry.publish(published);
      const source = deps.traces.get(draft.sourceTraceId);
      if (source) {
        source.status = "converted";
        await deps.persist.traces.save(source);
      }
      deps.ping();
      return { registrationId: published.registrationId };
    },
    clock: deps.clock,
    approvalUi: deps.approvalUi,
    persistAudit: (entry) => deps.persist.audit.save(entry),
  };
}

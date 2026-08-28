import { bindPayload } from "../compiler/bind";
import type { CommandResult, ProcedureDraft } from "../model/types";
import type { DryRunResult } from "../safety";

export function dryRunDraft(draft: ProcedureDraft): DryRunResult {
  const input: Record<string, unknown> = {};
  for (const parameter of draft.parameters) {
    input[parameter.key] = parameter.sampleValue;
  }
  const results: CommandResult[] = [];
  const steps: DryRunResult["steps"] = [];
  for (const step of draft.steps) {
    const resolvedPayload = bindPayload(step.payload, step.index, draft.bindings, input, results);
    steps.push({ index: step.index, commandId: step.commandId, resolvedPayload });
    results[step.index] = { ok: true, summary: step.resultSummary, data: step.payload };
  }
  return { steps };
}

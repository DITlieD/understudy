import type { Catalogue } from "../bus";
import type { Binding, ProcedureDraft, Trace } from "../model/types";
import { generalize } from "./generalize";
import { makeParameter, takeParameterKey } from "./classify";
import { leafName, valuesEqual, walkLeaves } from "./paths";

export function generalizeFromPair(
  traceA: Trace,
  traceB: Trace,
  catalogue: Catalogue,
): ProcedureDraft {
  if (traceA.steps.length !== traceB.steps.length) {
    throw new Error("command sequence mismatch");
  }
  for (let index = 0; index < traceA.steps.length; index += 1) {
    const stepA = traceA.steps[index];
    const stepB = traceB.steps[index];
    if (!stepA || !stepB || stepA.commandId !== stepB.commandId) {
      throw new Error("command sequence mismatch");
    }
  }
  const draft = generalize(traceA, catalogue);
  draft.id = `draft:${traceA.id}:${traceB.id}`;
  const usedKeys = new Set(draft.parameters.map((parameter) => parameter.key));
  for (let index = 0; index < traceA.steps.length; index += 1) {
    const stepA = traceA.steps[index];
    const stepB = traceB.steps[index];
    if (!stepA || !stepB) {
      continue;
    }
    const command = catalogue.get(stepA.commandId);
    const valuesA = new Map(walkLeaves(stepA.payload).map((leaf) => [leaf.path, leaf.value]));
    const valuesB = new Map(walkLeaves(stepB.payload).map((leaf) => [leaf.path, leaf.value]));
    const paths = new Set([...valuesA.keys(), ...valuesB.keys()]);
    for (const path of paths) {
      if (valuesEqual(valuesA.get(path), valuesB.get(path))) {
        continue;
      }
      const bindingIndex = draft.bindings.findIndex(
        (binding) => binding.targetStepIndex === stepA.index && binding.targetPayloadPath === path,
      );
      const existing = bindingIndex >= 0 ? draft.bindings[bindingIndex] : undefined;
      if (existing?.source === "stepOutput" || existing?.source === "parameter") {
        continue;
      }
      const sample = valuesA.get(path) ?? valuesB.get(path);
      const key = takeParameterKey(usedKeys, leafName(path), stepA.index, draft.parameters, sample);
      if (!draft.parameters.some((parameter) => parameter.key === key)) {
        draft.parameters.push(makeParameter(key, { path, value: sample }, stepA, command));
      }
      const next: Binding = {
        targetStepIndex: stepA.index,
        targetPayloadPath: path,
        source: "parameter",
        parameterKey: key,
      };
      if (bindingIndex >= 0) {
        draft.bindings[bindingIndex] = next;
      } else {
        draft.bindings.push(next);
      }
    }
  }
  return draft;
}

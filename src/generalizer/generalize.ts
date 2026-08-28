import type { Catalogue } from "../bus";
import type { Binding, Parameter, ProcedureDraft, Trace } from "../model/types";
import { classifyLeaf, makeParameter, takeParameterKey } from "./classify";
import { isEntityIdPath, walkLeaves } from "./paths";

export function generalize(trace: Trace, catalogue: Catalogue): ProcedureDraft {
  const steps = structuredClone(trace.steps);
  for (const step of steps) {
    const command = catalogue.get(step.commandId);
    if (command.sensitive) {
      throw new Error(`sensitive command cannot be generalized: ${step.commandId}`);
    }
  }
  const readIndices = steps
    .filter((step) => !catalogue.get(step.commandId).mutates)
    .map((step) => step.index);
  const usedKeys = new Set<string>();
  const parameters: Parameter[] = [];
  const bindings: Binding[] = [];
  const validationErrors: string[] = [];
  let explainedMutationTarget = false;
  let mutatingWithoutEntityId = false;
  let sawMutating = false;

  for (const step of steps) {
    const command = catalogue.get(step.commandId);
    if (command.mutates) {
      sawMutating = true;
    }
    const leaves = walkLeaves(step.payload);
    let stepHasEntityId = false;
    for (const leaf of leaves) {
      const entity = isEntityIdPath(leaf.path);
      if (entity) {
        stepHasEntityId = true;
      }
      const decision = classifyLeaf(leaf.path, step, readIndices);
      if (decision.source === "parameter") {
        const key = takeParameterKey(usedKeys, decision.keyBase, step.index, parameters, leaf.value);
        if (!parameters.some((parameter) => parameter.key === key)) {
          parameters.push(makeParameter(key, leaf, step, command));
        }
        bindings.push({
          targetStepIndex: step.index,
          targetPayloadPath: leaf.path,
          source: "parameter",
          parameterKey: key,
        });
      } else if (decision.source === "stepOutput") {
        bindings.push({
          targetStepIndex: step.index,
          targetPayloadPath: leaf.path,
          source: "stepOutput",
          sourceStepIndex: decision.sourceStepIndex,
          resultPath: decision.resultPath,
        });
        if (command.mutates && entity) {
          explainedMutationTarget = true;
        }
      } else {
        bindings.push({
          targetStepIndex: step.index,
          targetPayloadPath: leaf.path,
          source: "constant",
          frozenValue: leaf.value,
        });
      }
      if (command.mutates && entity && decision.source !== "stepOutput") {
        validationErrors.push(`unexplained selection: step ${step.index} ${leaf.path}`);
      }
    }
    if (command.mutates && !stepHasEntityId) {
      mutatingWithoutEntityId = true;
    }
  }

  const focusId = trace.focusContext.recordId;
  if (focusId && sawMutating && !explainedMutationTarget && mutatingWithoutEntityId) {
    validationErrors.push(`unexplained selection: focus record ${focusId}`);
  }

  return {
    id: `draft:${trace.id}`,
    sourceTraceId: trace.id,
    name: trace.label,
    description: "",
    parameters,
    steps,
    bindings,
    computedAnnotations: {
      readOnlyHint: !sawMutating,
      untrustedContentHint: false,
    },
    validationErrors,
  };
}

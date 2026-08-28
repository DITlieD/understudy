import type { Bus, Catalogue } from "../bus";
import { compile } from "../compiler";
import { generalize } from "../generalizer";
import type { ProcedureDraft, PublishedProcedure, Trace, TraceStep } from "../model/types";
import type { Registry } from "../registry";

export function failingStepIndex(lastError: string): number {
  const fromText = lastError.match(/^step (\d+) /);
  if (fromText) {
    return Number(fromText[1]);
  }
  try {
    const parsed = JSON.parse(lastError) as { failingStep?: unknown; error?: unknown };
    if (typeof parsed.failingStep === "number") {
      return parsed.failingStep;
    }
    if (typeof parsed.error === "string") {
      return failingStepIndex(parsed.error);
    }
  } catch {
    throw new Error("no failing step");
  }
  throw new Error("no failing step");
}

export function replacePublishedStep(
  procedure: PublishedProcedure,
  stepIndex: number,
  replacement: TraceStep,
  catalogue: Catalogue,
): ProcedureDraft {
  if (stepIndex < 0 || stepIndex >= procedure.steps.length) {
    throw new Error(`unknown step: ${stepIndex}`);
  }
  const steps = procedure.steps.map((step, index) =>
    index === stepIndex ? { ...replacement, index: stepIndex } : step,
  );
  const draft = generalize(
    {
      id: procedure.sourceTraceId,
      label: procedure.name,
      createdAt: procedure.publishedAt,
      authorLabel: procedure.approvedBy,
      focusContext: { recordId: null },
      steps,
      status: "generalized",
    } satisfies Trace,
    catalogue,
  );
  draft.id = procedure.id;
  draft.sourceTraceId = procedure.sourceTraceId;
  draft.name = procedure.name;
  draft.description = procedure.description;
  for (const parameter of draft.parameters) {
    const prior = procedure.parameters.find((item) => item.key === parameter.key);
    if (prior) {
      parameter.description = prior.description;
    }
  }
  return draft;
}

export async function applyRepair(deps: {
  catalogue: Catalogue;
  bus: Bus;
  registry: Registry;
  pending: { name: string; stepIndex: number };
  trace: Trace;
}): Promise<PublishedProcedure> {
  if (deps.trace.steps.length !== 1) {
    throw new Error("re-teach records a replacement for that step only");
  }
  const replacement = deps.trace.steps[0];
  if (!replacement) {
    throw new Error("re-teach records a replacement for that step only");
  }
  const procedure = deps.registry.list().find((item) => item.name === deps.pending.name);
  if (!procedure) {
    throw new Error(`unknown tool: ${deps.pending.name}`);
  }
  const draft = replacePublishedStep(
    procedure,
    deps.pending.stepIndex,
    replacement,
    deps.catalogue,
  );
  const compiled = compile(draft, deps.catalogue, { bus: deps.bus });
  const published: PublishedProcedure = {
    ...draft,
    computedAnnotations: compiled.annotations,
    publishedAt: procedure.publishedAt,
    approvedBy: procedure.approvedBy,
    registrationId: procedure.registrationId,
    invocationCount: procedure.invocationCount,
    successCount: procedure.successCount,
    lastError: null,
  };
  await deps.registry.replace(published);
  return published;
}

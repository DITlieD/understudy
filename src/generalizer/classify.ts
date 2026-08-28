import type {
  Parameter,
  Provenance,
  RegisteredCommand,
  TraceStep,
} from "../model/types";
import {
  inferJsonType,
  isEntityIdPath,
  leafName,
  nearestBefore,
  originApplies,
  parseDerivedControl,
  schemaInfo,
} from "./paths";

export type Decision =
  | { source: "parameter"; keyBase: string }
  | { source: "constant" }
  | { source: "stepOutput"; sourceStepIndex: number; resultPath: string };

export function classifyLeaf(path: string, step: TraceStep, readIndices: number[]): Decision {
  const applies = originApplies(path, step.provenance.sourceField);
  const origin = applies ? step.provenance.valueOrigin : undefined;
  const entity = isEntityIdPath(path);
  if (origin === "derived") {
    const output = resolveStepOutput(path, step.provenance, step.index, readIndices);
    if (output) {
      return output;
    }
  }
  if (entity) {
    return { source: "parameter", keyBase: leafName(path) };
  }
  if (origin === "typed" || origin === "picked") {
    return { source: "parameter", keyBase: leafName(path) };
  }
  return { source: "constant" };
}

export function takeParameterKey(
  usedKeys: Set<string>,
  base: string,
  stepIndex: number,
  parameters: Parameter[],
  sample: unknown,
): string {
  const reusable = parameters.find(
    (parameter) => parameter.key === base && parameter.sampleValue === sample,
  );
  if (reusable) {
    return reusable.key;
  }
  if (!usedKeys.has(base)) {
    usedKeys.add(base);
    return base;
  }
  const suffixed = `${base}_${stepIndex}`;
  if (!usedKeys.has(suffixed)) {
    usedKeys.add(suffixed);
    return suffixed;
  }
  let n = 2;
  while (usedKeys.has(`${base}_${n}`)) {
    n += 1;
  }
  const key = `${base}_${n}`;
  usedKeys.add(key);
  return key;
}

export function makeParameter(
  key: string,
  leaf: { path: string; value: unknown },
  step: TraceStep,
  command: RegisteredCommand,
): Parameter {
  const info = schemaInfo(command.payloadSchema, leaf.path);
  const parameter: Parameter = {
    key,
    jsonType: inferJsonType(leaf.value, info.jsonType),
    description: info.description ?? key,
    required: info.required,
    sampleValue: leaf.value,
    sourceStepIndex: step.index,
  };
  if (info.enumValues && info.enumValues.length > 0) {
    parameter.enumValues = info.enumValues;
  }
  return parameter;
}

function resolveStepOutput(
  path: string,
  provenance: Provenance,
  stepIndex: number,
  readIndices: number[],
): Decision | null {
  const parsed = parseDerivedControl(provenance.sourceControl);
  const sourceStepIndex = parsed?.sourceStepIndex ?? nearestBefore(stepIndex, readIndices);
  if (sourceStepIndex === undefined || sourceStepIndex < 0 || sourceStepIndex >= stepIndex) {
    return null;
  }
  return {
    source: "stepOutput",
    sourceStepIndex,
    resultPath: parsed?.resultPath ?? path,
  };
}

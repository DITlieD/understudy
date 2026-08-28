import type { Binding, CommandResult } from "../model/types";

export function getPath(root: unknown, path: string): unknown {
  if (path === "") return root;
  let current: unknown = root;
  for (const part of path.split(".")) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function setPath(root: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let current = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = current[key];
    if (next === null || next === undefined || typeof next !== "object") {
      const created: Record<string, unknown> = {};
      current[key] = created;
      current = created;
    } else {
      current = next as Record<string, unknown>;
    }
  }
  current[parts[parts.length - 1]!] = value;
}

export function bindPayload(
  recorded: Record<string, unknown>,
  stepIndex: number,
  bindings: Binding[],
  input: Record<string, unknown>,
  results: CommandResult[],
): Record<string, unknown> {
  const payload = { ...recorded };
  for (const binding of bindings) {
    if (binding.targetStepIndex !== stepIndex) continue;
    setPath(payload, binding.targetPayloadPath, resolveBinding(binding, input, results));
  }
  return payload;
}

function resolveBinding(
  binding: Binding,
  input: Record<string, unknown>,
  results: CommandResult[],
): unknown {
  if (binding.source === "parameter") {
    if (binding.parameterKey === undefined) {
      throw new Error("parameter binding missing parameterKey");
    }
    return input[binding.parameterKey];
  }
  if (binding.source === "constant") {
    return binding.frozenValue;
  }
  if (binding.sourceStepIndex === undefined || binding.resultPath === undefined) {
    throw new Error("stepOutput binding missing sourceStepIndex or resultPath");
  }
  const prior = results[binding.sourceStepIndex];
  if (prior === undefined) {
    throw new Error(`stepOutput refers to missing step ${binding.sourceStepIndex}`);
  }
  return getPath(prior, binding.resultPath);
}

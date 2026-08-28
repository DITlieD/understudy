import type { Bus } from "../bus";
import type { JsonSchema } from "../model/types";

export type CompileDeps = {
  bus: Bus;
};

export type ToolAnnotations = {
  readOnlyHint: boolean;
  untrustedContentHint: boolean;
};

export type CompiledTool = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: ToolAnnotations;
  execute: (
    input: Record<string, unknown>,
    extras: { signal: AbortSignal },
  ) => Promise<string>;
};

export type StepOutcome = {
  index: number;
  commandId: string;
  ok: boolean;
  summary: string;
};

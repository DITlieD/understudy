import type { Catalogue } from "../bus";
import type { ProcedureDraft } from "../model/types";
import { computeAnnotations } from "./annotations";
import { assertBudgets } from "./budgets";
import { createExecute } from "./execute";
import { buildInputSchema } from "./schema";
import type { CompiledTool, CompileDeps } from "./types";

export function compile(
  draft: ProcedureDraft,
  catalogue: Catalogue,
  deps: CompileDeps,
): CompiledTool {
  assertBudgets(draft);
  const annotations = computeAnnotations(draft, catalogue);
  return {
    name: draft.name,
    description: draft.description,
    inputSchema: buildInputSchema(draft.parameters),
    annotations,
    execute: createExecute(draft, deps.bus),
  };
}

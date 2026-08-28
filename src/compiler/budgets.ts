import type { ProcedureDraft } from "../model/types";

export const NAME_BUDGET = 30;
export const PARAM_DESCRIPTION_BUDGET = 150;
export const TOOL_DESCRIPTION_BUDGET = 500;
export const OUTPUT_BUDGET = 1500;

export function assertBudgets(draft: ProcedureDraft) {
  if (draft.name.length > NAME_BUDGET) {
    throw new Error(`tool name exceeds ${NAME_BUDGET} characters (${draft.name.length})`);
  }
  if (draft.description.length > TOOL_DESCRIPTION_BUDGET) {
    throw new Error(
      `tool description exceeds ${TOOL_DESCRIPTION_BUDGET} characters (${draft.description.length})`,
    );
  }
  for (const parameter of draft.parameters) {
    if (parameter.description.length > PARAM_DESCRIPTION_BUDGET) {
      throw new Error(
        `parameter description exceeds ${PARAM_DESCRIPTION_BUDGET} characters (${parameter.key}, ${parameter.description.length})`,
      );
    }
  }
  const projected = projectedOutputChars(draft);
  if (projected > OUTPUT_BUDGET) {
    throw new Error(`projected output exceeds ${OUTPUT_BUDGET} characters (${projected})`);
  }
}

function projectedOutputChars(draft: ProcedureDraft): number {
  return JSON.stringify({
    ok: true,
    steps: draft.steps.map((item) => ({
      index: item.index,
      commandId: item.commandId,
      ok: true,
      summary: item.resultSummary,
    })),
  }).length;
}

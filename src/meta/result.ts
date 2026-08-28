export const LIST_NEXT_STEP =
  "call understudy_draft_tool with one of these ids to read it";

export const DRAFT_NEXT_STEP =
  "now call understudy_draft_tool again with name, description and parameter descriptions";

export function toolResult(body: unknown, nextStep?: string): string {
  const json = JSON.stringify(body);
  return nextStep ? `${json}\n${nextStep}` : json;
}

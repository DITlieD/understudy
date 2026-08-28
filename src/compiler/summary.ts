import { OUTPUT_BUDGET } from "./budgets";
import type { StepOutcome } from "./types";

export function compactSummary(outcomes: StepOutcome[]): string {
  const ok = outcomes.every((item) => item.ok);
  const steps = outcomes.map((item) => ({
    index: item.index,
    commandId: item.commandId,
    ok: item.ok,
    summary: item.summary,
  }));
  const failing = outcomes.find((item) => !item.ok);
  const body =
    failing === undefined
      ? { ok, steps }
      : {
          ok,
          steps,
          failingStep: failing.index,
          error: `step ${failing.index} ${failing.commandId} failed: ${failing.summary}`,
        };
  const full = JSON.stringify(body);
  if (full.length <= OUTPUT_BUDGET) return full;
  return fitTruncated(ok, steps);
}

function fitTruncated(
  ok: boolean,
  steps: { index: number; commandId: string; ok: boolean; summary: string }[],
): string {
  const note = { truncated: true as const, limit: OUTPUT_BUDGET };
  const clone = steps.map((item) => ({ ...item }));
  for (;;) {
    const text = JSON.stringify({ ok, steps: clone, note });
    if (text.length <= OUTPUT_BUDGET) return text;
    const longest = longestSummaryIndex(clone);
    if (longest >= 0 && clone[longest]!.summary.length > 0) {
      const over = text.length - OUTPUT_BUDGET;
      clone[longest] = {
        ...clone[longest]!,
        summary: clone[longest]!.summary.slice(0, Math.max(0, clone[longest]!.summary.length - over)),
      };
      continue;
    }
    if (clone.length > 0) {
      clone.pop();
      continue;
    }
    return JSON.stringify({ ok, steps: [], note }).slice(0, OUTPUT_BUDGET);
  }
}

function longestSummaryIndex(steps: { summary: string }[]): number {
  let best = -1;
  let length = -1;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i]!.summary.length > length) {
      length = steps[i]!.summary.length;
      best = i;
    }
  }
  return best;
}

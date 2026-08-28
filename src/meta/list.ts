import type { Trace } from "../model/types";
import type { ModelContextTool } from "../webmcp/model-context";
import type { MetaPorts } from "./ports";
import { LIST_NEXT_STEP, toolResult } from "./result";

export function createListRecordingsTool(ports: MetaPorts): ModelContextTool {
  return {
    name: "understudy_list_recordings",
    description:
      "Enumerate unconverted recordings with step counts and one-line summaries. Call this first when turning a demonstration into a tool.",
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (_input, { signal }) => {
      if (signal.aborted) {
        throw new Error("aborted");
      }
      const recordings = ports
        .listTraces()
        .filter((trace) => trace.status !== "converted")
        .map((trace) => ({
          id: trace.id,
          label: trace.label,
          stepCount: trace.steps.length,
          summary: oneLine(trace),
        }));
      return toolResult({ recordings }, LIST_NEXT_STEP);
    },
  };
}

function oneLine(trace: Trace): string {
  const commands = trace.steps.map((step) => step.commandId).join(", ");
  if (commands === "") {
    return trace.label;
  }
  return `${trace.label}: ${commands}`;
}

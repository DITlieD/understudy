import type { ModelContextTool } from "../webmcp/model-context";
import { requireString, requireStringMap } from "./input";
import type { MetaPorts } from "./ports";
import { DRAFT_NEXT_STEP, toolResult } from "./result";

export function createDraftTool(ports: MetaPorts): ModelContextTool {
  return {
    name: "understudy_draft_tool",
    description:
      "Inspect a recording or create a draft. Pass recordingId alone to read the trace and candidate parameters. Pass name, description, and parameter descriptions to create a draft. Drafts are never registered.",
    inputSchema: {
      type: "object",
      properties: {
        recordingId: { type: "string", description: "Recording id from understudy_list_recordings." },
        name: { type: "string", description: "Tool name, at most 30 characters." },
        description: { type: "string", description: "Tool description for agent selection." },
        parameterDescriptions: {
          type: "object",
          description: "Map of parameter key to description.",
        },
      },
      required: ["recordingId"],
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: async (input, { signal }) => {
      if (signal.aborted) {
        throw new Error("aborted");
      }
      const recordingId = requireString(input, "recordingId");
      const trace = ports.getTrace(recordingId);
      if (!trace) {
        throw new Error(`unknown recording: ${recordingId}`);
      }
      const candidateParameters = ports.proposeCandidates(trace);
      const creating =
        typeof input["name"] === "string" ||
        typeof input["description"] === "string" ||
        input["parameterDescriptions"] !== undefined;
      if (!creating) {
        return toolResult({ trace, candidateParameters }, DRAFT_NEXT_STEP);
      }
      if (typeof input["name"] !== "string" || typeof input["description"] !== "string") {
        throw new Error(
          "name, description and parameter descriptions are required to create a draft",
        );
      }
      const name = requireString(input, "name");
      const description = requireString(input, "description");
      const parameterDescriptions = requireStringMap(input, "parameterDescriptions");
      for (const candidate of candidateParameters) {
        if (typeof parameterDescriptions[candidate.key] !== "string") {
          throw new Error(`missing parameter description: ${candidate.key}`);
        }
      }
      const draft = ports.createDraft({
        trace,
        name,
        description,
        parameterDescriptions,
      });
      return toolResult({ draft, registered: false });
    },
  };
}

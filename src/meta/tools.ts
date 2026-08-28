import type { ModelContextTool } from "../webmcp/model-context";
import { createDraftTool } from "./draft";
import { createListRecordingsTool } from "./list";
import type { MetaPorts } from "./ports";
import { createPublishTool } from "./publish";

export function createMetaTools(ports: MetaPorts): ModelContextTool[] {
  return [createListRecordingsTool(ports), createDraftTool(ports), createPublishTool(ports)];
}

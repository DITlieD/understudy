import type { AuditEntry } from "../model/types";
import { APPROVAL_TIMEOUT_MESSAGE, createApprovalGate, createAuditLog } from "../safety";
import type { ModelContextTool } from "../webmcp/model-context";
import { requireString } from "./input";
import type { MetaPorts } from "./ports";
import { toolResult } from "./result";

export function createPublishTool(ports: MetaPorts): ModelContextTool {
  const audit = createAuditLog(ports.persistAudit);
  const registrations = new Map<string, string>();
  const gate = createApprovalGate({ clock: ports.clock, ui: ports.approvalUi });
  return {
    name: "understudy_publish_tool",
    description:
      "Validate, dry-run, and publish a draft after a human approves in the page. Set poll true to return awaiting_approval and call again to collect the outcome.",
    inputSchema: {
      type: "object",
      properties: {
        draftId: { type: "string", description: "Draft id from understudy_draft_tool." },
        poll: {
          type: "boolean",
          description: "If true, return immediately with awaiting_approval.",
        },
      },
      required: ["draftId"],
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: async (input, { signal }) => {
      if (signal.aborted) {
        throw new Error("aborted");
      }
      const draftId = requireString(input, "draftId");
      const poll = input["poll"] === true;
      const draft = ports.getDraft(draftId);
      if (!draft) {
        throw new Error(`unknown draft: ${draftId}`);
      }
      const errors = ports.validate(draft);
      if (errors.length > 0) {
        throw new Error(`validation failed: ${errors.join("; ")}`);
      }
      const dryRun = ports.dryRun(draft);
      const result = await gate.decide(
        {
          draftId: draft.id,
          name: draft.name,
          description: draft.description,
          dryRun,
        },
        poll,
      );
      if (result.status === "awaiting_approval") {
        const message =
          result.reason === "timeout"
            ? APPROVAL_TIMEOUT_MESSAGE
            : "Human approval is required in the page. Call understudy_publish_tool again to collect the outcome.";
        return toolResult({ status: "awaiting_approval", dryRun, message });
      }
      if (result.status === "rejected") {
        await writeAudit(ports, audit, {
          actor: "human",
          action: "reject",
          toolName: draft.name,
          argsDigest: JSON.stringify({ draftId }),
          outcome: "rejected",
        });
        return toolResult({ status: "rejected", draftId });
      }
      let registrationId = registrations.get(draftId);
      if (!registrationId) {
        const published = await Promise.resolve(ports.register(draft, "human"));
        registrationId = published.registrationId;
        registrations.set(draftId, registrationId);
        await writeAudit(ports, audit, {
          actor: "human",
          action: "approve",
          toolName: draft.name,
          argsDigest: JSON.stringify({ draftId }),
          outcome: "registered",
        });
      }
      return toolResult({
        status: "published",
        draftId,
        name: draft.name,
        registrationId,
        dryRun,
      });
    },
  };
}

function writeAudit(
  ports: MetaPorts,
  audit: ReturnType<typeof createAuditLog>,
  fields: Omit<AuditEntry, "timestamp">,
) {
  return audit.write({
    timestamp: new Date(ports.clock.now()).toISOString(),
    ...fields,
  });
}

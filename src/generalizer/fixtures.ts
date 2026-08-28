import { createCatalogue, type Catalogue } from "../bus";
import type { Binding, CommandResult, ProcedureDraft, Provenance, Trace, TraceStep } from "../model/types";

export function typed(field: string, control = `${field}-input`): Provenance {
  return { sourceControl: control, sourceField: field, valueOrigin: "typed" };
}

export function picked(field: string, control = `${field}-picker`): Provenance {
  return { sourceControl: control, sourceField: field, valueOrigin: "picked" };
}

export function derivedFrom(field: string, stepIndex: number, resultPath = field): Provenance {
  return {
    sourceControl: `step:${stepIndex}/${resultPath}`,
    sourceField: field,
    valueOrigin: "derived",
  };
}

export function constantField(field: string, control = `${field}-button`): Provenance {
  return { sourceControl: control, sourceField: field, valueOrigin: "constant" };
}

export function formTyped(control: string): Provenance {
  return { sourceControl: control, sourceField: null, valueOrigin: "typed" };
}

export function makeStep(
  commandId: string,
  payload: Record<string, unknown>,
  provenance: Provenance,
  resultSummary = "ok",
): Omit<TraceStep, "index"> {
  return { commandId, payload, provenance, resultSummary };
}

export function makeTrace(
  steps: Omit<TraceStep, "index">[],
  overrides: Partial<Trace> = {},
): Trace {
  return {
    id: "trace-1",
    label: "weekly escalation",
    createdAt: "2026-08-27T00:00:00.000Z",
    authorLabel: "mara",
    focusContext: { recordId: null },
    status: "raw",
    ...overrides,
    steps: steps.map((step, index) => ({ ...step, index })),
  };
}

export function bindingAt(
  draft: ProcedureDraft,
  stepIndex: number,
  path: string,
): Binding | undefined {
  return draft.bindings.find(
    (binding) => binding.targetStepIndex === stepIndex && binding.targetPayloadPath === path,
  );
}

export function createOpsCatalogue(): Catalogue {
  const catalogue = createCatalogue();
  registerDemoCommands(catalogue);
  catalogue.registerCommand({
    id: "filter_tickets",
    title: "Filter tickets",
    description: "Filter the ticket list.",
    mutates: false,
    sensitive: false,
    payloadSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Ticket status filter.",
          enum: ["open", "unresolved", "closed"],
        },
        minMentions: { type: "integer", description: "Minimum mention count." },
      },
      required: ["status"],
    },
    handle: () => ({
      ok: true,
      summary: "filtered",
      data: { items: [{ id: "tkt-40" }] },
    }),
  });
  catalogue.registerCommand({
    id: "list_tickets",
    title: "List tickets",
    description: "List tickets in the current view.",
    mutates: false,
    sensitive: false,
    payloadSchema: { type: "object", properties: {} },
    handle: () => ({
      ok: true,
      summary: "listed",
      data: { items: [{ id: "tkt-40" }] },
    }),
  });
  catalogue.registerCommand({
    id: "escalate_ticket",
    title: "Escalate ticket",
    description: "Escalate one ticket.",
    mutates: true,
    sensitive: false,
    payloadSchema: {
      type: "object",
      properties: {
        ticketId: { type: "string", description: "Ticket to escalate." },
      },
      required: ["ticketId"],
    },
    handle: () => ({ ok: true, summary: "escalated", data: {} }),
  });
  catalogue.registerCommand({
    id: "apply_canned",
    title: "Apply canned reply",
    description: "Apply a canned template to a ticket.",
    mutates: true,
    sensitive: false,
    payloadSchema: {
      type: "object",
      properties: {
        ticketId: { type: "string", description: "Ticket to update." },
        template: { type: "string", description: "Canned template id." },
      },
      required: ["ticketId", "template"],
    },
    handle: () => ({ ok: true, summary: "applied", data: {} }),
  });
  catalogue.registerCommand({
    id: "set_count",
    title: "Set count",
    description: "Set a numeric count.",
    mutates: true,
    sensitive: false,
    payloadSchema: {
      type: "object",
      properties: {
        count: { type: "integer", description: "Count value." },
      },
      required: ["count"],
    },
    handle: () => ({ ok: true, summary: "counted", data: {} }),
  });
  catalogue.registerCommand({
    id: "set_flag",
    title: "Set flag",
    description: "Set a boolean flag.",
    mutates: true,
    sensitive: false,
    payloadSchema: {
      type: "object",
      properties: {
        enabled: { type: "boolean", description: "Flag value." },
      },
      required: ["enabled"],
    },
    handle: () => ({ ok: true, summary: "flagged", data: {} }),
  });
  catalogue.registerCommand({
    id: "save_view",
    title: "Save view",
    description: "Save a nested filter view.",
    mutates: true,
    sensitive: false,
    payloadSchema: {
      type: "object",
      properties: {
        filter: { type: "object", description: "Nested filter." },
      },
      required: ["filter"],
    },
    handle: () => ({ ok: true, summary: "saved", data: {} }),
  });
  catalogue.registerCommand({
    id: "bulk_delete",
    title: "Bulk delete",
    description: "Delete matching records.",
    mutates: true,
    sensitive: true,
    payloadSchema: { type: "object", properties: {} },
    handle: () => ({ ok: true, summary: "deleted", data: {} }),
  });
  return catalogue;
}

type DemoRecord = {
  title: string;
  priority: string;
  assignee: string;
  tags: string[];
};

function registerDemoCommands(catalogue: Catalogue) {
  const record: DemoRecord = {
    title: "",
    priority: "p4",
    assignee: "",
    tags: [],
  };
  catalogue.registerCommand({
    id: "set_title",
    title: "Set title",
    description: "Set the record title.",
    mutates: true,
    sensitive: false,
    payloadSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "New title." },
      },
      required: ["title"],
    },
    handle: (payload) => {
      record.title = String(payload["title"]);
      return ok(`title set to ${record.title}`, record);
    },
  });
  catalogue.registerCommand({
    id: "set_priority",
    title: "Set priority",
    description: "Set the record priority.",
    mutates: true,
    sensitive: false,
    payloadSchema: {
      type: "object",
      properties: {
        priority: {
          type: "string",
          description: "Priority rank.",
          enum: ["p1", "p2", "p3", "p4"],
        },
      },
      required: ["priority"],
    },
    handle: (payload) => {
      record.priority = String(payload["priority"]);
      return ok(`priority set to ${record.priority}`, record);
    },
  });
  catalogue.registerCommand({
    id: "set_assignee",
    title: "Set assignee",
    description: "Set the record assignee.",
    mutates: true,
    sensitive: false,
    payloadSchema: {
      type: "object",
      properties: {
        assignee: { type: "string", description: "Assignee id." },
      },
      required: ["assignee"],
    },
    handle: (payload) => {
      record.assignee = String(payload["assignee"]);
      return ok(`assignee set to ${record.assignee}`, record);
    },
  });
  catalogue.registerCommand({
    id: "add_tag",
    title: "Add tag",
    description: "Add a tag to the record.",
    mutates: true,
    sensitive: false,
    payloadSchema: {
      type: "object",
      properties: {
        tag: { type: "string", description: "Tag to add." },
      },
      required: ["tag"],
    },
    handle: (payload) => {
      const tag = String(payload["tag"]);
      if (!record.tags.includes(tag)) {
        record.tags.push(tag);
      }
      return ok(`tag added ${tag}`, record);
    },
  });
}

function ok(summary: string, record: DemoRecord): CommandResult {
  return {
    ok: true,
    summary,
    data: {
      title: record.title,
      priority: record.priority,
      assignee: record.assignee,
      tags: [...record.tags],
    },
  };
}


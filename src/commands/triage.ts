import type { Catalogue } from "../bus";
import type { JsonSchema } from "../model/types";
import {
  applyCannedTemplate,
  filterTickets,
  readTicket,
  selectTicket,
  setAssignee,
  setPriority,
  setStatus,
  setTags,
} from "../seed/ops";
import { OPERATORS, PRIORITIES, STATUSES, TEMPLATES, type TriageState } from "../seed/tickets";

export function registerTriageCommands(catalogue: Catalogue, state: TriageState) {
  catalogue.registerCommand({
    id: "filter_tickets",
    title: "Filter tickets",
    description: "Return tickets that match status, priority, assignee, tag, queue, or a query string.",
    mutates: false,
    sensitive: false,
    payloadSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Ticket status.", enum: [...STATUSES] },
        priority: { type: "string", description: "Priority rank.", enum: [...PRIORITIES] },
        assignee: { type: "string", description: "Assignee id, or unassigned." },
        tag: { type: "string", description: "Tag that must be present." },
        queue: { type: "string", description: "Queue name." },
        query: { type: "string", description: "Match title, id, tag, queue, body, or customer." },
      },
    },
    handle: (payload) => filterTickets(state, payload),
  });

  catalogue.registerCommand({
    id: "get_ticket",
    title: "Get ticket",
    description: "Return one ticket by id without changing focus.",
    mutates: false,
    sensitive: false,
    payloadSchema: ticketIdSchema(),
    handle: (payload) => readTicket(state, payload),
  });

  catalogue.registerCommand({
    id: "list_templates",
    title: "List templates",
    description: "Return canned-response templates.",
    mutates: false,
    sensitive: false,
    payloadSchema: emptySchema(),
    handle: () => ({
      ok: true,
      summary: `${TEMPLATES.length} templates`,
      data: {
        templates: TEMPLATES.map((template) => ({ ...template, tags: [...template.tags] })),
      },
    }),
  });

  catalogue.registerCommand({
    id: "list_assignees",
    title: "List assignees",
    description: "Return operators who can own a ticket.",
    mutates: false,
    sensitive: false,
    payloadSchema: emptySchema(),
    handle: () => ({
      ok: true,
      summary: `${OPERATORS.length} assignees`,
      data: { assignees: OPERATORS.map((operator) => ({ ...operator })) },
    }),
  });

  catalogue.registerCommand({
    id: "select_ticket",
    title: "Select ticket",
    description: "Focus a ticket in the queue.",
    mutates: true,
    sensitive: false,
    payloadSchema: ticketIdSchema(),
    handle: (payload) => selectTicket(state, payload),
  });

  catalogue.registerCommand({
    id: "set_ticket_priority",
    title: "Set ticket priority",
    description: "Set priority on a ticket.",
    mutates: true,
    sensitive: false,
    payloadSchema: {
      type: "object",
      properties: {
        ticketId: { type: "string", description: "Ticket id." },
        priority: { type: "string", description: "Priority rank.", enum: [...PRIORITIES] },
      },
      required: ["ticketId", "priority"],
    },
    handle: (payload) => setPriority(state, payload),
  });

  catalogue.registerCommand({
    id: "set_ticket_status",
    title: "Set ticket status",
    description: "Set status on a ticket.",
    mutates: true,
    sensitive: false,
    payloadSchema: {
      type: "object",
      properties: {
        ticketId: { type: "string", description: "Ticket id." },
        status: { type: "string", description: "Ticket status.", enum: [...STATUSES] },
      },
      required: ["ticketId", "status"],
    },
    handle: (payload) => setStatus(state, payload),
  });

  catalogue.registerCommand({
    id: "set_ticket_assignee",
    title: "Set ticket assignee",
    description: "Assign a ticket, or clear the assignee.",
    mutates: true,
    sensitive: false,
    payloadSchema: {
      type: "object",
      properties: {
        ticketId: { type: "string", description: "Ticket id." },
        assignee: { type: "string", description: "Operator id, or empty to unassign." },
      },
      required: ["ticketId", "assignee"],
    },
    handle: (payload) => setAssignee(state, payload),
  });

  catalogue.registerCommand({
    id: "set_ticket_tags",
    title: "Set ticket tags",
    description: "Replace the tag list on a ticket.",
    mutates: true,
    sensitive: false,
    payloadSchema: {
      type: "object",
      properties: {
        ticketId: { type: "string", description: "Ticket id." },
        tags: { type: "array", description: "Full tag list." },
      },
      required: ["ticketId", "tags"],
    },
    handle: (payload) => setTags(state, payload),
  });

  catalogue.registerCommand({
    id: "apply_template",
    title: "Apply template",
    description: "Fill the reply draft from a canned template, merge tags, and optionally set status.",
    mutates: true,
    sensitive: false,
    payloadSchema: {
      type: "object",
      properties: {
        ticketId: { type: "string", description: "Ticket id." },
        templateId: { type: "string", description: "Template id." },
      },
      required: ["ticketId", "templateId"],
    },
    handle: (payload) => applyCannedTemplate(state, payload, TEMPLATES),
  });
}

function emptySchema(): JsonSchema {
  return { type: "object", properties: {} };
}

function ticketIdSchema(): JsonSchema {
  return {
    type: "object",
    properties: { ticketId: { type: "string", description: "Ticket id." } },
    required: ["ticketId"],
  };
}

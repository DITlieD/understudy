import type { CommandResult } from "../model/types";
import type { Operator, Template } from "../seed/tickets";
import type { TicketFocus, TicketRow, TriageView } from "./view";

export function applyResult(view: TriageView, commandId: string, result: CommandResult) {
  if (!result.ok) {
    view.error = result.summary;
    return;
  }
  if (commandId === "filter_tickets") {
    view.tickets = asRows(result.data["tickets"]);
    return;
  }
  if (commandId === "list_templates") {
    view.templates = asTemplates(result.data["templates"]);
    return;
  }
  if (commandId === "list_assignees") {
    view.assignees = asOperators(result.data["assignees"]);
    return;
  }
  if (commandId === "select_ticket" || commandId === "get_ticket" || isMutation(commandId)) {
    const focused = asFocus(result.data);
    view.focused = focused;
    view.tagDraft = "";
    patchRow(view.tickets, focused);
  }
}

function isMutation(commandId: string): boolean {
  return (
    commandId === "set_ticket_priority" ||
    commandId === "set_ticket_status" ||
    commandId === "set_ticket_assignee" ||
    commandId === "set_ticket_tags" ||
    commandId === "apply_template"
  );
}

function patchRow(tickets: TicketRow[], focused: TicketFocus) {
  const index = tickets.findIndex((ticket) => ticket.id === focused.id);
  if (index < 0) {
    return;
  }
  tickets[index] = {
    id: focused.id,
    title: focused.title,
    status: focused.status,
    priority: focused.priority,
    assignee: focused.assignee,
    tags: [...focused.tags],
    queue: focused.queue,
    customer: focused.customer,
    createdAt: focused.createdAt,
  };
}

function asRows(value: unknown): TicketRow[] {
  if (!Array.isArray(value)) {
    throw new Error("invalid tickets result");
  }
  return value.map((entry) => asRow(entry));
}

function asRow(value: unknown): TicketRow {
  const record = asRecord(value);
  return {
    id: asStr(record, "id"),
    title: asStr(record, "title"),
    status: asStr(record, "status"),
    priority: asStr(record, "priority"),
    assignee: asStr(record, "assignee"),
    tags: asTags(record["tags"]),
    queue: asStr(record, "queue"),
    customer: asStr(record, "customer"),
    createdAt: asStr(record, "createdAt"),
  };
}

function asFocus(record: Record<string, unknown>): TicketFocus {
  return {
    ...asRow(record),
    body: asStr(record, "body"),
    replyDraft: asStr(record, "replyDraft"),
  };
}

function asTemplates(value: unknown): Template[] {
  if (!Array.isArray(value)) {
    throw new Error("invalid templates result");
  }
  return value.map((entry) => {
    const record = asRecord(entry);
    const setStatus = record["setStatus"];
    return {
      id: asStr(record, "id"),
      name: asStr(record, "name"),
      body: asStr(record, "body"),
      tags: asTags(record["tags"]),
      setStatus:
        setStatus === "open" || setStatus === "pending" || setStatus === "resolved" || setStatus === "escalated"
          ? setStatus
          : null,
    };
  });
}

function asOperators(value: unknown): Operator[] {
  if (!Array.isArray(value)) {
    throw new Error("invalid assignees result");
  }
  return value.map((entry) => {
    const record = asRecord(entry);
    return { id: asStr(record, "id"), name: asStr(record, "name") };
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error("invalid record");
  }
  return value as Record<string, unknown>;
}

function asStr(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`invalid field: ${key}`);
  }
  return value;
}

function asTags(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error("invalid tags");
  }
  return [...value];
}

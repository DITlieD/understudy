import type { CommandResult } from "../model/types";
import {
  OPERATORS,
  PRIORITIES,
  STATUSES,
  type Ticket,
  type TicketPriority,
  type TicketStatus,
  type TriageState,
} from "./tickets";

export function filterTickets(state: TriageState, payload: Record<string, unknown>): CommandResult {
  const matched = state.tickets.filter((ticket) => matches(ticket, payload));
  return {
    ok: true,
    summary: `${matched.length} tickets`,
    data: {
      count: matched.length,
      ticketIds: matched.map((ticket) => ticket.id),
      tickets: matched.map((ticket) => summary(ticket)),
    },
  };
}

export function selectTicket(state: TriageState, payload: Record<string, unknown>): CommandResult {
  const ticket = requireTicket(state, str(payload, "ticketId"));
  state.focusedId = ticket.id;
  return okTicket(`focused ${ticket.id}`, ticket);
}

export function readTicket(state: TriageState, payload: Record<string, unknown>): CommandResult {
  return okTicket("ticket", requireTicket(state, str(payload, "ticketId")));
}

export function setPriority(state: TriageState, payload: Record<string, unknown>): CommandResult {
  const ticket = requireTicket(state, str(payload, "ticketId"));
  const priority = str(payload, "priority");
  if (!isPriority(priority)) {
    throw new Error(`invalid priority: ${priority}`);
  }
  ticket.priority = priority;
  return okTicket(`priority ${ticket.id} ${priority}`, ticket);
}

export function setStatus(state: TriageState, payload: Record<string, unknown>): CommandResult {
  const ticket = requireTicket(state, str(payload, "ticketId"));
  const status = str(payload, "status");
  if (!isStatus(status)) {
    throw new Error(`invalid status: ${status}`);
  }
  ticket.status = status;
  return okTicket(`status ${ticket.id} ${status}`, ticket);
}

export function setAssignee(state: TriageState, payload: Record<string, unknown>): CommandResult {
  const ticket = requireTicket(state, str(payload, "ticketId"));
  const assignee = str(payload, "assignee");
  if (assignee !== "" && !OPERATORS.some((operator) => operator.id === assignee)) {
    throw new Error(`unknown assignee: ${assignee}`);
  }
  ticket.assignee = assignee;
  return okTicket(`assignee ${ticket.id} ${assignee || "unassigned"}`, ticket);
}

export function setTags(state: TriageState, payload: Record<string, unknown>): CommandResult {
  const ticket = requireTicket(state, str(payload, "ticketId"));
  ticket.tags = asStringArray(payload, "tags");
  return okTicket(`tags ${ticket.id}`, ticket);
}

export function applyCannedTemplate(
  state: TriageState,
  payload: Record<string, unknown>,
  templates: Array<{ id: string; body: string; tags: string[]; setStatus: TicketStatus | null }>,
): CommandResult {
  const ticket = requireTicket(state, str(payload, "ticketId"));
  const templateId = str(payload, "templateId");
  const template = templates.find((entry) => entry.id === templateId);
  if (!template) {
    throw new Error(`unknown template: ${templateId}`);
  }
  ticket.replyDraft = template.body;
  for (const tag of template.tags) {
    if (!ticket.tags.includes(tag)) {
      ticket.tags.push(tag);
    }
  }
  if (template.setStatus) {
    ticket.status = template.setStatus;
  }
  return okTicket(`template ${template.id} on ${ticket.id}`, ticket);
}

function matches(ticket: Ticket, payload: Record<string, unknown>): boolean {
  const status = optional(payload, "status");
  if (status && ticket.status !== status) {
    return false;
  }
  const priority = optional(payload, "priority");
  if (priority && ticket.priority !== priority) {
    return false;
  }
  const assignee = optional(payload, "assignee");
  if (assignee) {
    if (assignee === "unassigned") {
      if (ticket.assignee !== "") {
        return false;
      }
    } else if (ticket.assignee !== assignee) {
      return false;
    }
  }
  const tag = optional(payload, "tag");
  if (tag && !ticket.tags.includes(tag)) {
    return false;
  }
  const queue = optional(payload, "queue");
  if (queue && ticket.queue !== queue) {
    return false;
  }
  const query = optional(payload, "query");
  if (query) {
    const hay = [
      ticket.id,
      ticket.title,
      ticket.body,
      ticket.customer,
      ticket.queue,
      ticket.status,
      ticket.priority,
      ticket.assignee,
      ...ticket.tags,
    ]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(query.toLowerCase())) {
      return false;
    }
  }
  return true;
}

function requireTicket(state: TriageState, id: string): Ticket {
  const ticket = state.tickets.find((entry) => entry.id === id);
  if (!ticket) {
    throw new Error(`unknown ticket: ${id}`);
  }
  return ticket;
}

function summary(ticket: Ticket): Record<string, unknown> {
  return {
    id: ticket.id,
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    assignee: ticket.assignee,
    tags: [...ticket.tags],
    queue: ticket.queue,
    customer: ticket.customer,
    createdAt: ticket.createdAt,
  };
}

function okTicket(summaryText: string, ticket: Ticket): CommandResult {
  return {
    ok: true,
    summary: summaryText,
    data: { ...summary(ticket), body: ticket.body, replyDraft: ticket.replyDraft },
  };
}

function str(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string") {
    throw new Error(`missing required field: ${key}`);
  }
  return value;
}

function optional(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`invalid field: ${key}`);
  }
  return value;
}

function asStringArray(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`invalid field: ${key}`);
  }
  return value.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

function isPriority(value: string): value is TicketPriority {
  return (PRIORITIES as string[]).includes(value);
}

function isStatus(value: string): value is TicketStatus {
  return (STATUSES as string[]).includes(value);
}

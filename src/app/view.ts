import type { Operator, Template } from "../seed/tickets";
import { PRIORITIES, STATUSES } from "../seed/tickets";

export type TicketRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee: string;
  tags: string[];
  queue: string;
  customer: string;
  createdAt: string;
};

export type TicketFocus = TicketRow & {
  body: string;
  replyDraft: string;
};

export type FilterDraft = {
  query: string;
};

export type TriageView = {
  tickets: TicketRow[];
  focused: TicketFocus | null;
  templates: Template[];
  assignees: Operator[];
  filters: FilterDraft;
  error: string | null;
  tagDraft: string;
};

export function renderTriage(host: HTMLElement, view: TriageView) {
  const app = h("section", { class: "triage-app" }, renderQueue(view), renderDetail(view));
  host.replaceChildren(app);
}

function renderQueue(view: TriageView): HTMLElement {
  const form = h(
    "form",
    { class: "triage-filters", "data-role": "filters" },
    h(
      "header",
      { class: "triage-queue-head" },
      h("p", { class: "triage-count" }, String(view.tickets.length)),
      h("input", {
        type: "search",
        class: "triage-search",
        name: "query",
        "data-kind": "filter",
        value: view.filters.query,
        "aria-label": "Search title, id, tag, or queue",
        autocomplete: "off",
      }),
    ),
    h("button", { type: "submit", class: "triage-sr", "aria-label": "Apply search" }, "Apply"),
  );
  const list =
    view.tickets.length === 0
      ? h("p", { class: "triage-empty" }, "No tickets match.")
      : h(
          "ul",
          { class: "triage-list" },
          ...view.tickets.map((ticket) => renderRow(ticket, view.focused?.id === ticket.id, view.assignees)),
        );
  return h(
    "aside",
    { class: "triage-queue" },
    form,
    view.error ? h("p", { class: "triage-error", role: "alert" }, view.error) : "",
    list,
  );
}

function renderRow(ticket: TicketRow, selected: boolean, assignees: Operator[]): HTMLElement {
  const className = selected ? "triage-row is-selected" : "triage-row";
  return h(
    "li",
    {},
    h(
      "button",
      { type: "button", class: className, "data-ticket-id": ticket.id },
      h("span", { class: "triage-row-id" }, ticket.id),
      h("span", { class: `triage-pri triage-pri-${ticket.priority}` }, ticket.priority.toUpperCase()),
      h("span", { class: "triage-row-title" }, ticket.title),
      h(
        "span",
        { class: "triage-row-meta" },
        `${ticket.queue} · ${ticket.status} · ${assigneeName(assignees, ticket.assignee)}`,
      ),
    ),
  );
}

function renderDetail(view: TriageView): HTMLElement {
  const ticket = view.focused;
  if (!ticket) {
    return h(
      "article",
      { class: "triage-detail is-empty" },
      h("p", { class: "triage-pick" }, "Pick a ticket."),
    );
  }
  return h(
    "article",
    { class: "triage-detail", "data-focused-id": ticket.id },
    h(
      "header",
      { class: "triage-detail-head" },
      h("p", { class: "triage-detail-id" }, ticket.id),
      h("h2", {}, ticket.title),
      h("p", { class: "triage-detail-cust" }, `${ticket.customer} · ${ticket.queue}`),
    ),
    h("p", { class: "triage-body" }, ticket.body),
    h(
      "div",
      { class: "triage-chips" },
      chipGroup(
        "status",
        statusLabel(ticket.status),
        STATUSES.map((value) => ({ value, label: statusLabel(value) })),
        ticket.status,
      ),
      chipGroup(
        "priority",
        ticket.priority.toUpperCase(),
        PRIORITIES.map((value) => ({ value, label: value.toUpperCase() })),
        ticket.priority,
      ),
      chipGroup(
        "assignee",
        assigneeName(view.assignees, ticket.assignee),
        [
          { value: "", label: "Unassigned" },
          ...view.assignees.map((operator) => ({ value: operator.id, label: operator.name })),
        ],
        ticket.assignee,
      ),
      ...ticket.tags.map((tag) =>
        h(
          "button",
          { type: "button", class: "triage-chip", "data-action": "remove-tag", "data-tag": tag },
          tag,
        ),
      ),
      h("input", {
        class: "triage-chip-input",
        name: "tag-add",
        "data-kind": "tag-add",
        value: view.tagDraft,
        "aria-label": "Add tag",
      }),
    ),
    h("textarea", {
      class: "triage-draft-box",
      readonly: "true",
      "aria-label": "Reply draft",
    }, ticket.replyDraft),
    h(
      "div",
      { class: "triage-templates" },
      h("p", { class: "triage-insert" }, "Insert reply"),
      ...view.templates.map((template) =>
        h(
          "button",
          {
            type: "button",
            class: "triage-tpl",
            "data-action": "apply-template",
            "data-template-id": template.id,
          },
          template.name,
        ),
      ),
    ),
  );
}

function chipGroup(
  field: string,
  currentLabel: string,
  options: Array<{ value: string; label: string }>,
  current: string,
): HTMLElement {
  return h(
    "details",
    { class: "triage-chip-group" },
    h("summary", { class: "triage-chip is-on" }, currentLabel),
    h(
      "div",
      { class: "triage-chip-opts" },
      ...options
        .filter((option) => option.value !== current)
        .map((option) =>
          h(
            "button",
            {
              type: "button",
              class: "triage-chip",
              "data-action": `set-${field}`,
              "data-value": option.value,
            },
            option.label,
          ),
        ),
    ),
  );
}

function statusLabel(status: string): string {
  if (status === "open") return "Open";
  if (status === "pending") return "Pending";
  if (status === "resolved") return "Resolved";
  if (status === "escalated") return "Escalated";
  return status;
}

function assigneeName(assignees: Operator[], id: string): string {
  if (!id) return "Unassigned";
  return assignees.find((operator) => operator.id === id)?.name ?? id;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") {
      node.className = value;
      continue;
    }
    node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child === "") {
      continue;
    }
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

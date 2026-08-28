import type { Bus } from "../bus";
import type { CommandResult, Provenance } from "../model/types";
import { applyResult } from "./results";
import { renderTriage, type FilterDraft, type TriageView } from "./view";
import "./triage.css";

export type AppRun = (
  commandId: string,
  payload: Record<string, unknown>,
  provenance: Provenance,
) => CommandResult;

const FIELD_CHIPS: Record<string, { command: string; key: string; control: string }> = {
  "set-status": { command: "set_ticket_status", key: "status", control: "status-chip" },
  "set-priority": { command: "set_ticket_priority", key: "priority", control: "priority-chip" },
  "set-assignee": { command: "set_ticket_assignee", key: "assignee", control: "assignee-chip" },
};

export function mountTriageApp(element: HTMLElement, bus: Bus, runCommand: AppRun) {
  const view: TriageView = {
    tickets: [],
    focused: null,
    templates: [],
    assignees: [],
    filters: emptyFilters(),
    error: null,
    tagDraft: "",
  };

  const run: AppRun = (commandId, payload, provenance) => {
    try {
      view.error = null;
      const result = runCommand(commandId, payload, provenance);
      applyResult(view, commandId, result);
      renderTriage(element, view);
      return result;
    } catch (caught) {
      view.error = caught instanceof Error ? caught.message : "Command failed.";
      renderTriage(element, view);
      throw caught;
    }
  };

  if (element.dataset["triageBound"] !== "1") {
    element.dataset["triageBound"] = "1";
    bind(element, view, run);
    bus.subscribe((event) => {
      applyResult(view, event.commandId, event.result);
      renderTriage(element, view);
    });
  }

  run("list_assignees", {}, mountProvenance("list-assignees", null));
  run("list_templates", {}, mountProvenance("list-templates", null));
  run("filter_tickets", {}, mountProvenance("filter-tickets", null));
}

function bind(
  element: HTMLElement,
  view: TriageView,
  run: (commandId: string, payload: Record<string, unknown>, provenance: Provenance) => CommandResult,
) {
  element.addEventListener("submit", (event) => {
    const form = (event.target as HTMLElement | null)?.closest?.("form[data-role='filters']");
    if (!form || !element.contains(form)) {
      return;
    }
    event.preventDefault();
    readFilters(form, view.filters);
    run("filter_tickets", filterPayload(view.filters), {
      sourceControl: "filter-apply",
      sourceField: "query",
      valueOrigin: view.filters.query ? "typed" : "picked",
    });
  });

  element.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (target.dataset["kind"] === "filter") {
      view.filters.query = target.value;
      return;
    }
    if (target.dataset["kind"] === "tag-add") {
      view.tagDraft = target.value;
    }
  });

  element.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.dataset["kind"] !== "tag-add") {
      return;
    }
    event.preventDefault();
    const focused = view.focused;
    if (!focused) {
      return;
    }
    const next = target.value.trim();
    if (!next) {
      return;
    }
    const tags = focused.tags.includes(next) ? [...focused.tags] : [...focused.tags, next];
    view.tagDraft = "";
    run("set_ticket_tags", { ticketId: focused.id, tags }, fieldProvenance("tags-input", "tags", "typed"));
  });

  element.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const row = target.closest("[data-ticket-id]");
    if (row instanceof HTMLElement && row.dataset["ticketId"]) {
      const ticketId = row.dataset["ticketId"];
      run("select_ticket", { ticketId }, {
        sourceControl: "queue-row",
        sourceField: "ticketId",
        valueOrigin: "picked",
      });
      return;
    }
    const action = target.closest("[data-action]");
    if (!(action instanceof HTMLElement) || !view.focused) {
      return;
    }
    const kind = action.dataset["action"] ?? "";
    const field = FIELD_CHIPS[kind];
    if (field) {
      run(
        field.command,
        { ticketId: view.focused.id, [field.key]: action.dataset["value"] ?? "" },
        fieldProvenance(field.control, field.key, "picked"),
      );
      return;
    }
    if (kind === "remove-tag") {
      const tag = action.dataset["tag"] ?? "";
      const tags = view.focused.tags.filter((entry) => entry !== tag);
      run(
        "set_ticket_tags",
        { ticketId: view.focused.id, tags },
        fieldProvenance("tags-chip", "tags", "picked"),
      );
      return;
    }
    if (kind === "apply-template") {
      const templateId = action.dataset["templateId"] || view.templates[0]?.id || "";
      run("apply_template", { ticketId: view.focused.id, templateId }, {
        sourceControl: "template-apply",
        sourceField: "templateId",
        valueOrigin: "picked",
      });
    }
  });
}

function filterPayload(filters: FilterDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (filters.query) {
    payload.query = filters.query;
  }
  return payload;
}

function readFilters(form: Element, filters: FilterDraft) {
  const control = form.querySelector("[name='query']");
  if (control instanceof HTMLInputElement) {
    filters.query = control.value;
  }
}

function emptyFilters(): FilterDraft {
  return { query: "" };
}

function mountProvenance(sourceControl: string, sourceField: string | null): Provenance {
  return { sourceControl, sourceField, valueOrigin: "derived" };
}

function fieldProvenance(
  sourceControl: string,
  sourceField: string,
  valueOrigin: Provenance["valueOrigin"],
): Provenance {
  return { sourceControl, sourceField, valueOrigin };
}

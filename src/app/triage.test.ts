import { beforeEach, describe, expect, it } from "vitest";
import { createBus, createCatalogue } from "../bus";
import { registerTriageCommands } from "../commands/triage";
import { SEED_TICKETS, TEMPLATES, createTriageState } from "../seed/tickets";
import { mountTriageApp } from "./index";

function boot() {
  const catalogue = createCatalogue();
  const state = createTriageState();
  registerTriageCommands(catalogue, state);
  const bus = createBus(catalogue);
  return { bus, catalogue, state };
}

describe("seed tickets", () => {
  it("seeds forty realistic tickets", () => {
    expect(SEED_TICKETS).toHaveLength(40);
    expect(new Set(SEED_TICKETS.map((ticket) => ticket.id)).size).toBe(40);
    expect(SEED_TICKETS.every((ticket) => ticket.title.length > 0)).toBe(true);
    expect(SEED_TICKETS.every((ticket) => ticket.body.length > 0)).toBe(true);
  });
});

describe("filter command", () => {
  it("returns only tickets that match the tag and stays read-only", () => {
    const { bus, catalogue } = boot();
    expect(catalogue.get("filter_tickets").mutates).toBe(false);
    const result = bus.dispatch("filter_tickets", { tag: "billing" });
    expect(result.ok).toBe(true);
    const tickets = result.data["tickets"] as { tags: string[] }[];
    expect(tickets.length).toBeGreaterThan(0);
    expect(tickets.length).toBeLessThan(SEED_TICKETS.length);
    for (const ticket of tickets) {
      expect(ticket.tags).toContain("billing");
    }
  });

  it("matches title, id, tag, and queue from one query string", () => {
    const { bus } = boot();
    const byId = bus.dispatch("filter_tickets", { query: "T-1041" });
    expect((byId.data["tickets"] as { id: string }[]).map((ticket) => ticket.id)).toEqual(["T-1041"]);
    const byTag = bus.dispatch("filter_tickets", { query: "gdpr" });
    const taggedIds = (byTag.data["tickets"] as { id: string }[]).map((ticket) => ticket.id);
    expect(taggedIds).toEqual(expect.arrayContaining(["T-1077", "T-1078"]));
    const byQueue = bus.dispatch("filter_tickets", { query: "shipping" });
    const queuedIds = (byQueue.data["tickets"] as { id: string }[]).map((ticket) => ticket.id);
    expect(queuedIds).toContain("T-1057");
    expect(queuedIds).not.toContain("T-1041");
  });
});

describe("assign command", () => {
  it("assigns a ticket through the bus", () => {
    const { bus, state } = boot();
    const ticketId = SEED_TICKETS[0]?.id;
    expect(ticketId).toBeTruthy();
    const result = bus.dispatch("set_ticket_assignee", {
      ticketId,
      assignee: "priya",
    });
    expect(result.ok).toBe(true);
    expect(result.data["assignee"]).toBe("priya");
    expect(state.tickets.find((ticket) => ticket.id === ticketId)?.assignee).toBe(
      "priya",
    );
  });
});

describe("template command", () => {
  it("applies a canned template onto the ticket reply draft", () => {
    const { bus } = boot();
    const ticketId = SEED_TICKETS[0]?.id;
    const template = TEMPLATES[0];
    expect(ticketId).toBeTruthy();
    expect(template).toBeTruthy();
    const result = bus.dispatch("apply_template", {
      ticketId,
      templateId: template?.id,
    });
    expect(result.ok).toBe(true);
    expect(result.data["replyDraft"]).toBe(template?.body);
  });
});

describe("mountTriageApp", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("does not throw in jsdom and leaves foundation slots empty", () => {
    const { bus } = boot();
    const appRoot = document.createElement("div");
    appRoot.id = "app-root";
    const teaching = document.createElement("div");
    teaching.id = "teaching-panel";
    const library = document.createElement("div");
    library.id = "tool-library";
    const meter = document.createElement("div");
    meter.id = "budget-meter";
    const trace = document.createElement("div");
    trace.id = "execution-trace";
    document.body.append(appRoot, teaching, library, meter, trace);
    expect(() => mountTriageApp(appRoot, bus, (id, payload) => bus.dispatch(id, payload))).not.toThrow();
    expect(appRoot.querySelector(".triage-app")).not.toBeNull();
    expect(appRoot.querySelector(".triage-filter-row")).toBeNull();
    expect(appRoot.querySelector("select")).toBeNull();
    expect(appRoot.querySelector("input[type=search]")).not.toBeNull();
    expect(teaching.childElementCount).toBe(0);
    expect(library.childElementCount).toBe(0);
    expect(meter.childElementCount).toBe(0);
    expect(trace.childElementCount).toBe(0);
  });
});

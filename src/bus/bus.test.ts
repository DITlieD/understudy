import { describe, expect, it } from "vitest";
import { createBus, createCatalogue } from "../bus";
import { registerTriageCommands } from "../commands/triage";
import { SEED_TICKETS, createTriageState } from "../seed";

function boot() {
  const catalogue = createCatalogue();
  const state = createTriageState();
  registerTriageCommands(catalogue, state);
  const bus = createBus(catalogue);
  return { bus, catalogue, state };
}

describe("command catalogue", () => {
  it("registers triage commands and none are sensitive", () => {
    const { catalogue } = boot();
    const listed = catalogue.list();
    const ids = listed.map((command) => command.id);
    expect(ids).toContain("filter_tickets");
    expect(ids).toContain("set_ticket_assignee");
    expect(listed.some((command) => command.mutates)).toBe(true);
    expect(listed.some((command) => !command.mutates)).toBe(true);
    for (const command of listed) {
      expect(command.sensitive).toBe(false);
      expect(command.payloadSchema.type).toBe("object");
    }
  });

  it("marks a query command as read-only", () => {
    const { catalogue } = boot();
    expect(catalogue.get("filter_tickets").mutates).toBe(false);
    expect(catalogue.get("get_ticket").mutates).toBe(false);
  });
});

describe("command bus dispatch", () => {
  it("mutates a ticket through each write command", () => {
    const { bus, state } = boot();
    const ticketId = "T-1045";
    expect(bus.dispatch("set_ticket_assignee", { ticketId, assignee: "mara" }).ok).toBe(true);
    expect(state.tickets.find((ticket) => ticket.id === ticketId)?.assignee).toBe("mara");
    expect(bus.dispatch("set_ticket_priority", { ticketId, priority: "p1" }).data["priority"]).toBe(
      "p1",
    );
    const tagged = bus.dispatch("set_ticket_tags", { ticketId, tags: ["billing"] });
    expect(tagged.ok).toBe(true);
    expect(state.tickets.find((ticket) => ticket.id === ticketId)?.tags).toEqual(["billing"]);
  });

  it("notifies subscribers with command id, payload, and result", () => {
    const { bus } = boot();
    const ticketId = SEED_TICKETS[0]?.id;
    const seen: string[] = [];
    const stop = bus.subscribe((event) => {
      seen.push(`${event.commandId}:${String(event.payload["ticketId"] ?? "")}:${event.result.ok}`);
    });
    bus.dispatch("set_ticket_assignee", { ticketId, assignee: "priya" });
    expect(seen).toEqual([`set_ticket_assignee:${ticketId}:true`]);
    stop();
    bus.dispatch("set_ticket_assignee", { ticketId, assignee: "mara" });
    expect(seen).toEqual([`set_ticket_assignee:${ticketId}:true`]);
  });

  it("fails fast on an unknown command", () => {
    const { bus } = boot();
    expect(() => bus.dispatch("explode", {})).toThrow(/unknown command: explode/i);
  });

  it("fails fast when a required payload field is missing", () => {
    const { bus } = boot();
    expect(() => bus.dispatch("set_ticket_assignee", {})).toThrow(/ticketId/i);
  });

  it("dispatches a catalogued read command without flipping mutates", () => {
    const { bus, catalogue } = boot();
    let mutates: boolean | undefined;
    bus.subscribe((event) => {
      mutates = event.mutates;
    });
    const result = bus.dispatch("filter_tickets", {});
    expect(result.ok).toBe(true);
    expect(mutates).toBe(false);
    expect(catalogue.get("filter_tickets").mutates).toBe(false);
  });
});

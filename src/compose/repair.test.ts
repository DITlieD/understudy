import { describe, expect, it } from "vitest";
import { createCatalogue } from "../bus";
import { registerTriageCommands } from "../commands/triage";
import { generalize } from "../generalizer";
import type { PublishedProcedure, Trace, TraceStep } from "../model/types";
import { createTriageState } from "../seed";
import { failingStepIndex, replacePublishedStep } from "./repair";

function provenance(field: string, origin: "typed" | "picked") {
  return { sourceControl: field, sourceField: field, valueOrigin: origin };
}

function step(
  index: number,
  commandId: string,
  payload: Record<string, unknown>,
  field: string,
  origin: "typed" | "picked",
): TraceStep {
  return {
    index,
    commandId,
    payload,
    provenance: provenance(field, origin),
    resultSummary: "ok",
  };
}

function traceOf(steps: TraceStep[]): Trace {
  return {
    id: "tr-1",
    label: "proc",
    createdAt: "2026-08-27T00:00:00.000Z",
    authorLabel: "human",
    focusContext: { recordId: null },
    steps,
    status: "raw",
  };
}

describe("replacePublishedStep", () => {
  it("replaces one step and leaves the others", () => {
    const catalogue = createCatalogue();
    registerTriageCommands(catalogue, createTriageState());
    const source = traceOf([
      step(0, "filter_tickets", { tag: "billing" }, "tag", "typed"),
      step(1, "set_ticket_priority", { ticketId: "T-1041", priority: "p1" }, "priority", "picked"),
    ]);
    const draft = generalize(source, catalogue);
    const procedure: PublishedProcedure = {
      ...draft,
      name: "proc",
      description: "A procedure.",
      publishedAt: "2026-08-27T00:00:00.000Z",
      approvedBy: "human",
      registrationId: "reg-1",
      invocationCount: 2,
      successCount: 1,
      lastError: "step 1 set_ticket_priority failed: unknown ticket: NOPE",
    };
    const next = replacePublishedStep(
      procedure,
      1,
      step(0, "set_ticket_assignee", { ticketId: "T-1043", assignee: "sam" }, "assignee", "picked"),
      catalogue,
    );
    expect(next.steps.map((item) => item.commandId)).toEqual([
      "filter_tickets",
      "set_ticket_assignee",
    ]);
    expect(next.steps[0]?.payload).toEqual({ tag: "billing" });
    expect(next.name).toBe("proc");
    expect(next.description).toBe("A procedure.");
  });
});

describe("failingStepIndex", () => {
  it("reads the index from a named error", () => {
    expect(failingStepIndex("step 1 set_ticket_priority failed: unknown ticket: NOPE")).toBe(1);
  });
});

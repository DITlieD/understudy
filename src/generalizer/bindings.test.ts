import { describe, expect, it } from "vitest";
import { generalize } from "../generalizer";
import {
  bindingAt,
  constantField,
  createOpsCatalogue,
  derivedFrom,
  formTyped,
  makeStep,
  makeTrace,
  picked,
} from "./fixtures";

describe("bindings, reads, and unexplained selection", () => {
  const catalogue = createOpsCatalogue();

  it("emits parameter, stepOutput, and constant bindings together", () => {
    const draft = generalize(
      makeTrace([
        makeStep(
          "filter_tickets",
          { status: "unresolved", minMentions: 3 },
          formTyped("filter-form"),
        ),
        makeStep(
          "escalate_ticket",
          { ticketId: "tkt-40" },
          derivedFrom("ticketId", 0, "items.0.id"),
        ),
        makeStep(
          "apply_canned",
          { ticketId: "tkt-40", template: "ack-wait" },
          derivedFrom("ticketId", 0, "items.0.id"),
        ),
      ]),
      catalogue,
    );
    expect(bindingAt(draft, 0, "status")?.source).toBe("parameter");
    expect(bindingAt(draft, 0, "minMentions")?.source).toBe("parameter");
    expect(bindingAt(draft, 1, "ticketId")).toEqual(
      expect.objectContaining({
        source: "stepOutput",
        sourceStepIndex: 0,
        resultPath: "items.0.id",
      }),
    );
    expect(bindingAt(draft, 2, "template")?.source).toBe("constant");
    expect(bindingAt(draft, 2, "ticketId")?.source).toBe("stepOutput");
  });

  it("chains a later step to an earlier read output path", () => {
    const draft = generalize(
      makeTrace([
        makeStep("list_tickets", {}, constantField("noop", "refresh")),
        makeStep("filter_tickets", { status: "open" }, formTyped("filter-form")),
        makeStep("set_title", { title: "hold" }, { sourceControl: "title-input", sourceField: "title", valueOrigin: "typed" }),
        makeStep(
          "escalate_ticket",
          { ticketId: "tkt-9" },
          derivedFrom("ticketId", 1, "items.0.id"),
        ),
      ]),
      catalogue,
    );
    expect(draft.steps).toHaveLength(4);
    expect(bindingAt(draft, 3, "ticketId")).toEqual(
      expect.objectContaining({
        source: "stepOutput",
        sourceStepIndex: 1,
        resultPath: "items.0.id",
      }),
    );
  });

  it("records read and query steps as first-class draft steps", () => {
    const draft = generalize(
      makeTrace([
        makeStep("filter_tickets", { status: "unresolved" }, formTyped("filter-form")),
        makeStep("list_tickets", {}, constantField("noop", "refresh")),
        makeStep("escalate_ticket", { ticketId: "tkt-40" }, derivedFrom("ticketId", 0, "items.0.id")),
      ]),
      catalogue,
    );
    expect(draft.steps.map((step) => step.commandId)).toEqual([
      "filter_tickets",
      "list_tickets",
      "escalate_ticket",
    ]);
    expect(catalogue.get("filter_tickets").mutates).toBe(false);
    expect(catalogue.get("list_tickets").mutates).toBe(false);
  });

  it("flags unexplained selection when a mutation target has no prior read", () => {
    const draft = generalize(
      makeTrace(
        [makeStep("escalate_ticket", { ticketId: "tkt-40" }, picked("ticketId", "ticket-list"))],
        { focusContext: { recordId: "tkt-40" } },
      ),
      catalogue,
    );
    expect(draft.validationErrors.some((error) => /unexplained selection/i.test(error))).toBe(
      true,
    );
    expect(draft.validationErrors.some((error) => /ticketId/.test(error))).toBe(true);
    expect(bindingAt(draft, 0, "ticketId")?.source).toBe("parameter");
  });

  it("does not flag a mutation target derived from a prior read", () => {
    const draft = generalize(
      makeTrace([
        makeStep("filter_tickets", { status: "unresolved" }, formTyped("filter-form")),
        makeStep(
          "escalate_ticket",
          { ticketId: "tkt-40" },
          derivedFrom("ticketId", 0, "items.0.id"),
        ),
      ]),
      catalogue,
    );
    expect(draft.validationErrors.filter((error) => /unexplained selection/i.test(error))).toEqual(
      [],
    );
    expect(bindingAt(draft, 1, "ticketId")?.source).toBe("stepOutput");
  });

  it("flags unexplained focus when mutations rely on a selected record with no read", () => {
    const draft = generalize(
      makeTrace(
        [makeStep("set_title", { title: "n" }, { sourceControl: "title-input", sourceField: "title", valueOrigin: "typed" })],
        { focusContext: { recordId: "tkt-40" } },
      ),
      catalogue,
    );
    expect(draft.validationErrors.some((error) => /unexplained selection: focus record tkt-40/.test(error))).toBe(
      true,
    );
  });
});

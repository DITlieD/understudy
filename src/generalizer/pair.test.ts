import { describe, expect, it } from "vitest";
import { generalizeFromPair } from "../generalizer";
import {
  bindingAt,
  constantField,
  createOpsCatalogue,
  derivedFrom,
  formTyped,
  makeStep,
  makeTrace,
  picked,
  typed,
} from "./fixtures";

describe("second-demonstration diffing", () => {
  const catalogue = createOpsCatalogue();

  it("treats payload positions that differ as parameters", () => {
    const traceA = makeTrace(
      [
        makeStep("set_title", { title: "billing sweep" }, typed("title")),
        makeStep("set_priority", { priority: "p2" }, picked("priority")),
        makeStep("add_tag", { tag: "billing" }, typed("tag")),
      ],
      { id: "trace-a" },
    );
    const traceB = makeTrace(
      [
        makeStep("set_title", { title: "login outage" }, typed("title")),
        makeStep("set_priority", { priority: "p1" }, picked("priority")),
        makeStep("add_tag", { tag: "auth" }, typed("tag")),
      ],
      { id: "trace-b" },
    );
    const draft = generalizeFromPair(traceA, traceB, catalogue);
    expect(draft.parameters.map((parameter) => parameter.key).sort()).toEqual([
      "priority",
      "tag",
      "title",
    ]);
    expect(bindingAt(draft, 0, "title")?.source).toBe("parameter");
    expect(bindingAt(draft, 1, "priority")?.source).toBe("parameter");
    expect(bindingAt(draft, 2, "tag")?.source).toBe("parameter");
  });

  it("keeps matching constant positions as constants", () => {
    const stepA = makeStep(
      "apply_canned",
      { ticketId: "tkt-1", template: "ack-wait" },
      constantField("template", "canned-ack-button"),
    );
    const stepB = makeStep(
      "apply_canned",
      { ticketId: "tkt-9", template: "ack-wait" },
      constantField("template", "canned-ack-button"),
    );
    const draft = generalizeFromPair(
      makeTrace([stepA], { id: "trace-a" }),
      makeTrace([stepB], { id: "trace-b" }),
      catalogue,
    );
    expect(bindingAt(draft, 0, "template")).toEqual(
      expect.objectContaining({ source: "constant", frozenValue: "ack-wait" }),
    );
    expect(bindingAt(draft, 0, "ticketId")?.source).toBe("parameter");
  });

  it("keeps matching entity ids as parameters across a pair", () => {
    const draft = generalizeFromPair(
      makeTrace(
        [makeStep("escalate_ticket", { ticketId: "tkt-40" }, picked("ticketId", "ticket-list"))],
        { id: "trace-a" },
      ),
      makeTrace(
        [makeStep("escalate_ticket", { ticketId: "tkt-40" }, picked("ticketId", "ticket-list"))],
        { id: "trace-b" },
      ),
      catalogue,
    );
    expect(bindingAt(draft, 0, "ticketId")?.source).toBe("parameter");
    expect(draft.parameters[0]?.key).toBe("ticketId");
  });

  it("keeps derived pair diffs as step-output bindings", () => {
    const draft = generalizeFromPair(
      makeTrace(
        [
          makeStep("filter_tickets", { status: "unresolved" }, formTyped("filter-form")),
          makeStep(
            "escalate_ticket",
            { ticketId: "tkt-40" },
            derivedFrom("ticketId", 0, "items.0.id"),
          ),
        ],
        { id: "trace-a" },
      ),
      makeTrace(
        [
          makeStep("filter_tickets", { status: "open" }, formTyped("filter-form")),
          makeStep(
            "escalate_ticket",
            { ticketId: "tkt-12" },
            derivedFrom("ticketId", 0, "items.0.id"),
          ),
        ],
        { id: "trace-b" },
      ),
      catalogue,
    );
    expect(bindingAt(draft, 0, "status")?.source).toBe("parameter");
    expect(bindingAt(draft, 1, "ticketId")).toEqual(
      expect.objectContaining({
        source: "stepOutput",
        sourceStepIndex: 0,
        resultPath: "items.0.id",
      }),
    );
  });

  it("promotes a differing constant position to a parameter", () => {
    const draft = generalizeFromPair(
      makeTrace(
        [
          makeStep(
            "apply_canned",
            { ticketId: "tkt-1", template: "ack-wait" },
            constantField("template", "canned-ack-button"),
          ),
        ],
        { id: "trace-a" },
      ),
      makeTrace(
        [
          makeStep(
            "apply_canned",
            { ticketId: "tkt-1", template: "resolved" },
            constantField("template", "canned-resolved-button"),
          ),
        ],
        { id: "trace-b" },
      ),
      catalogue,
    );
    expect(bindingAt(draft, 0, "template")?.source).toBe("parameter");
    expect(draft.parameters.some((parameter) => parameter.key === "template")).toBe(true);
  });

  it("throws when paired traces disagree on command sequence", () => {
    expect(() =>
      generalizeFromPair(
        makeTrace([makeStep("set_title", { title: "a" }, typed("title"))], { id: "a" }),
        makeTrace([makeStep("add_tag", { tag: "b" }, typed("tag"))], { id: "b" }),
        catalogue,
      ),
    ).toThrow(/command sequence mismatch/i);
  });
});

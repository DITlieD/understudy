import { describe, expect, it } from "vitest";
import { generalize } from "../generalizer";
import {
  bindingAt,
  constantField,
  createOpsCatalogue,
  makeStep,
  makeTrace,
  picked,
  typed,
} from "./fixtures";

describe("literal extraction and types", () => {
  const catalogue = createOpsCatalogue();

  it("extracts a typed payload field as a parameter", () => {
    const draft = generalize(
      makeTrace([makeStep("set_title", { title: "P2 billing sweep" }, typed("title"))]),
      catalogue,
    );
    expect(draft.parameters).toEqual([
      expect.objectContaining({
        key: "title",
        jsonType: "string",
        required: true,
        sampleValue: "P2 billing sweep",
        sourceStepIndex: 0,
      }),
    ]);
    expect(bindingAt(draft, 0, "title")).toEqual(
      expect.objectContaining({ source: "parameter", parameterKey: "title" }),
    );
  });

  it("extracts a picked payload field as a parameter with schema enums", () => {
    const draft = generalize(
      makeTrace([makeStep("set_priority", { priority: "p2" }, picked("priority"))]),
      catalogue,
    );
    expect(draft.parameters[0]).toEqual(
      expect.objectContaining({
        key: "priority",
        jsonType: "string",
        enumValues: ["p1", "p2", "p3", "p4"],
        sampleValue: "p2",
      }),
    );
    expect(bindingAt(draft, 0, "priority")?.source).toBe("parameter");
  });

  it("treats a selected record id as a parameter never a constant", () => {
    const draft = generalize(
      makeTrace([
        makeStep(
          "escalate_ticket",
          { ticketId: "tkt-40" },
          picked("ticketId", "ticket-list"),
        ),
      ]),
      catalogue,
    );
    expect(draft.parameters.map((parameter) => parameter.key)).toEqual(["ticketId"]);
    expect(bindingAt(draft, 0, "ticketId")?.source).toBe("parameter");
    expect(bindingAt(draft, 0, "ticketId")?.frozenValue).toBeUndefined();
  });

  it("refuses to freeze an entity id even when provenance is constant", () => {
    const draft = generalize(
      makeTrace([
        makeStep("escalate_ticket", { ticketId: "tkt-40" }, constantField("ticketId")),
      ]),
      catalogue,
    );
    expect(bindingAt(draft, 0, "ticketId")?.source).toBe("parameter");
    expect(draft.parameters[0]?.key).toBe("ticketId");
  });

  it("infers integer and boolean types from the command schema", () => {
    const draft = generalize(
      makeTrace([
        makeStep("set_count", { count: 3 }, typed("count")),
        makeStep("set_flag", { enabled: true }, picked("enabled")),
      ]),
      catalogue,
    );
    expect(draft.parameters.find((parameter) => parameter.key === "count")?.jsonType).toBe(
      "integer",
    );
    expect(draft.parameters.find((parameter) => parameter.key === "enabled")?.jsonType).toBe(
      "boolean",
    );
  });

  it("keeps fixed UI affordances as constant bindings", () => {
    const draft = generalize(
      makeTrace([
        makeStep(
          "apply_canned",
          { ticketId: "tkt-40", template: "ack-wait" },
          constantField("template", "canned-ack-button"),
        ),
      ]),
      catalogue,
    );
    expect(bindingAt(draft, 0, "template")).toEqual(
      expect.objectContaining({ source: "constant", frozenValue: "ack-wait" }),
    );
    expect(draft.parameters.map((parameter) => parameter.key)).toEqual(["ticketId"]);
  });

  it("walks nested payload paths into bindings", () => {
    const draft = generalize(
      makeTrace([
        makeStep("save_view", { filter: { status: "open" } }, typed("filter", "view-form")),
      ]),
      catalogue,
    );
    expect(bindingAt(draft, 0, "filter.status")?.source).toBe("parameter");
    expect(draft.parameters[0]?.sampleValue).toBe("open");
  });

  it("copies ordered steps and names the draft from the trace label", () => {
    const trace = makeTrace([
      makeStep("set_title", { title: "alpha" }, typed("title")),
      makeStep("add_tag", { tag: "billing" }, typed("tag")),
    ]);
    const draft = generalize(trace, catalogue);
    expect(draft.sourceTraceId).toBe("trace-1");
    expect(draft.name).toBe("weekly escalation");
    expect(draft.steps.map((step) => step.commandId)).toEqual(["set_title", "add_tag"]);
  });
});

describe("annotations and fail-fast", () => {
  const catalogue = createOpsCatalogue();

  it("sets readOnlyHint false when any step mutates", () => {
    const draft = generalize(
      makeTrace([makeStep("set_title", { title: "x" }, typed("title"))]),
      catalogue,
    );
    expect(draft.computedAnnotations.readOnlyHint).toBe(false);
    expect(draft.computedAnnotations.untrustedContentHint).toBe(false);
  });

  it("sets readOnlyHint true when every step is a read", () => {
    const draft = generalize(
      makeTrace([makeStep("list_tickets", {}, { sourceControl: "refresh", sourceField: null, valueOrigin: "constant" })]),
      catalogue,
    );
    expect(draft.computedAnnotations.readOnlyHint).toBe(true);
  });

  it("throws on an unknown command", () => {
    expect(() =>
      generalize(makeTrace([makeStep("explode", {}, typed("x"))]), catalogue),
    ).toThrow(/unknown command: explode/i);
  });

  it("throws when a sensitive command appears in the trace", () => {
    expect(() =>
      generalize(makeTrace([makeStep("bulk_delete", {}, constantField("x"))]), catalogue),
    ).toThrow(/sensitive command cannot be generalized: bulk_delete/i);
  });
});

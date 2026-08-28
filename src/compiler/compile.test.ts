import { describe, expect, it } from "vitest";
import { createBus, createCatalogue } from "../bus";
import type { Binding, Parameter, ProcedureDraft, TraceStep } from "../model/types";
import { compile, UNTRUSTED_CONTENT_RULE } from "../compiler";

function provenance() {
  return {
    sourceControl: "field",
    sourceField: "title",
    valueOrigin: "typed" as const,
  };
}

function step(
  index: number,
  commandId: string,
  payload: Record<string, unknown>,
  resultSummary = "ok",
): TraceStep {
  return { index, commandId, payload, provenance: provenance(), resultSummary };
}

function param(partial: Partial<Parameter> & Pick<Parameter, "key">): Parameter {
  return {
    jsonType: "string",
    description: "A parameter.",
    required: true,
    sampleValue: "x",
    sourceStepIndex: 0,
    ...partial,
  };
}

function draft(overrides: Partial<ProcedureDraft> = {}): ProcedureDraft {
  return {
    id: "d1",
    sourceTraceId: "t1",
    name: "set_rec_title",
    description: "Set the record title from an argument.",
    parameters: [param({ key: "title", description: "New title." })],
    steps: [step(0, "set_title", { title: "hello" })],
    bindings: [
      {
        targetStepIndex: 0,
        targetPayloadPath: "title",
        source: "parameter",
        parameterKey: "title",
      } satisfies Binding,
    ],
    computedAnnotations: { readOnlyHint: true, untrustedContentHint: true },
    validationErrors: [],
    ...overrides,
  };
}

function bootMutating() {
  const catalogue = createCatalogue();
  const record = { title: "" };
  catalogue.registerCommand({
    id: "set_title",
    title: "Set title",
    description: "Set the record title.",
    mutates: true,
    sensitive: false,
    payloadSchema: {
      type: "object",
      properties: { title: { type: "string", description: "New title." } },
      required: ["title"],
    },
    handle: (payload) => {
      record.title = String(payload["title"]);
      return { ok: true, summary: `title ${record.title}`, data: { title: record.title } };
    },
  });
  return { catalogue, bus: createBus(catalogue), record };
}

describe("compile inputSchema", () => {
  it("builds properties, enums, and required from the parameter list", () => {
    const { catalogue, bus } = bootMutating();
    const tool = compile(
      draft({
        name: "set_priority",
        description: "Set priority from an enum argument.",
        parameters: [
          param({
            key: "priority",
            description: "Priority rank.",
            enumValues: ["p1", "p2", "p3", "p4"],
          }),
          param({ key: "note", description: "Optional note.", required: false }),
        ],
        steps: [step(0, "set_title", { title: "x" })],
      }),
      catalogue,
      { bus },
    );
    expect(tool.inputSchema).toEqual({
      type: "object",
      properties: {
        priority: {
          type: "string",
          description: "Priority rank.",
          enum: ["p1", "p2", "p3", "p4"],
        },
        note: { type: "string", description: "Optional note." },
      },
      required: ["priority"],
    });
  });
});

describe("compile annotations", () => {
  it("sets readOnlyHint true only when no step mutates, ignoring draft.computedAnnotations", () => {
    const { catalogue, bus } = bootMutating();
    const mutating = compile(draft(), catalogue, { bus });
    expect(mutating.annotations.readOnlyHint).toBe(false);

    const reads = createCatalogue();
    reads.registerCommand({
      id: "get_record",
      title: "Get record",
      description: "Return the record.",
      mutates: false,
      sensitive: false,
      payloadSchema: { type: "object", properties: {} },
      handle: () => ({ ok: true, summary: "record", data: { title: "n" } }),
    });
    const readTool = compile(
      draft({
        name: "get_rec",
        description: "Read the current record.",
        parameters: [],
        steps: [step(0, "get_record", {})],
        bindings: [],
        computedAnnotations: { readOnlyHint: false, untrustedContentHint: true },
      }),
      reads,
      { bus: createBus(reads) },
    );
    expect(readTool.annotations.readOnlyHint).toBe(true);
    expect(readTool.annotations.untrustedContentHint).toBe(false);
  });

  it("sets untrustedContentHint from returnsUntrusted or known content fields, never hand-set", () => {
    const flagged = createCatalogue();
    const flaggedDef = {
      id: "get_ticket",
      title: "Get ticket",
      description: "Return a ticket.",
      mutates: false,
      sensitive: false,
      payloadSchema: { type: "object" as const, properties: {} },
      handle: () => ({ ok: true, summary: "ticket", data: { body: "hi" } }),
    };
    flagged.registerCommand(Object.assign(flaggedDef, { returnsUntrusted: true }));
    const flaggedTool = compile(
      draft({
        name: "read_ticket",
        description: "Read a ticket body.",
        parameters: [],
        steps: [step(0, "get_ticket", {})],
        bindings: [],
        computedAnnotations: { readOnlyHint: true, untrustedContentHint: false },
      }),
      flagged,
      { bus: createBus(flagged) },
    );
    expect(flaggedTool.annotations.untrustedContentHint).toBe(true);
    expect(flaggedTool.annotations.readOnlyHint).toBe(true);

    const fields = createCatalogue();
    fields.registerCommand({
      id: "get_body",
      title: "Get body",
      description: "Return ticket body.",
      mutates: false,
      sensitive: false,
      payloadSchema: {
        type: "object",
        properties: { body: { type: "string", description: "Ticket body." } },
      },
      handle: () => ({ ok: true, summary: "body", data: { body: "x" } }),
    });
    const fieldTool = compile(
      draft({
        name: "read_body",
        description: "Read ticket body by known field.",
        parameters: [],
        steps: [step(0, "get_body", { body: "stored" })],
        bindings: [],
        computedAnnotations: { readOnlyHint: true, untrustedContentHint: false },
      }),
      fields,
      { bus: createBus(fields) },
    );
    expect(fieldTool.annotations.untrustedContentHint).toBe(true);
  });

  it("documents the untrusted content fallback rule", () => {
    expect(UNTRUSTED_CONTENT_RULE).toMatch(/returnsUntrusted/);
    expect(UNTRUSTED_CONTENT_RULE).toMatch(/body|ticketBody|userContent/);
  });
});

describe("compile chrome budgets", () => {
  it("blocks a name over 30 characters", () => {
    const { catalogue, bus } = bootMutating();
    expect(() => compile(draft({ name: "n".repeat(31) }), catalogue, { bus })).toThrow(
      /name exceeds 30 characters/,
    );
  });

  it("blocks a parameter description over 150 characters", () => {
    const { catalogue, bus } = bootMutating();
    expect(() =>
      compile(
        draft({
          parameters: [param({ key: "title", description: "d".repeat(151) })],
        }),
        catalogue,
        { bus },
      ),
    ).toThrow(/parameter description exceeds 150 characters/);
  });

  it("blocks a tool description over 500 characters", () => {
    const { catalogue, bus } = bootMutating();
    expect(() => compile(draft({ description: "d".repeat(501) }), catalogue, { bus })).toThrow(
      /description exceeds 500 characters/,
    );
  });

  it("blocks projected output over 1500 characters", () => {
    const { catalogue, bus } = bootMutating();
    expect(() =>
      compile(draft({ steps: [step(0, "set_title", { title: "x" }, "s".repeat(1600))] }), catalogue, {
        bus,
      }),
    ).toThrow(/projected output exceeds 1500 characters/);
  });
});

describe("compile descriptor", () => {
  it("returns name, description, inputSchema, annotations, and execute without modelContext", () => {
    const { catalogue, bus } = bootMutating();
    let touched = false;
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      get() {
        touched = true;
        return {};
      },
    });
    const tool = compile(draft(), catalogue, { bus });
    expect(tool.name).toBe("set_rec_title");
    expect(tool.description).toBe("Set the record title from an argument.");
    expect(typeof tool.execute).toBe("function");
    expect(touched).toBe(false);
  });
});

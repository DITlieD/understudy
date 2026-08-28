import { describe, expect, it } from "vitest";
import { createBus, createCatalogue } from "../bus";
import type { Binding, ProcedureDraft, TraceStep } from "../model/types";
import { compile } from "../compiler";

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

function draft(overrides: Partial<ProcedureDraft> = {}): ProcedureDraft {
  return {
    id: "d1",
    sourceTraceId: "t1",
    name: "set_rec_title",
    description: "Set the record title from an argument.",
    parameters: [
      {
        key: "title",
        jsonType: "string",
        description: "New title.",
        required: true,
        sampleValue: "hello",
        sourceStepIndex: 0,
      },
    ],
    steps: [step(0, "set_title", { title: "hello" })],
    bindings: [
      {
        targetStepIndex: 0,
        targetPayloadPath: "title",
        source: "parameter",
        parameterKey: "title",
      } satisfies Binding,
    ],
    computedAnnotations: { readOnlyHint: false, untrustedContentHint: false },
    validationErrors: [],
    ...overrides,
  };
}

function boot() {
  const catalogue = createCatalogue();
  const record = { title: "", priority: "p4" };
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
  catalogue.registerCommand({
    id: "set_priority",
    title: "Set priority",
    description: "Set the record priority.",
    mutates: true,
    sensitive: false,
    payloadSchema: {
      type: "object",
      properties: {
        priority: { type: "string", description: "Priority rank.", enum: ["p1", "p2", "p3", "p4"] },
      },
      required: ["priority"],
    },
    handle: (payload) => {
      record.priority = String(payload["priority"]);
      return {
        ok: true,
        summary: `priority ${record.priority}`,
        data: { priority: record.priority },
      };
    },
  });
  catalogue.registerCommand({
    id: "get_record",
    title: "Get record",
    description: "Return the record.",
    mutates: false,
    sensitive: false,
    payloadSchema: { type: "object", properties: {} },
    handle: () => {
      return { ok: true, summary: "record", data: { title: record.title, priority: record.priority } };
    },
  });
  const dispatched: { id: string; payload: Record<string, unknown> }[] = [];
  const inner = createBus(catalogue);
  const bus = {
    dispatch(commandId: string, payload: Record<string, unknown>) {
      dispatched.push({ id: commandId, payload: { ...payload } });
      return inner.dispatch(commandId, payload);
    },
    subscribe: inner.subscribe.bind(inner),
  };
  return { catalogue, bus, record, dispatched };
}

function twoStepDraft(): ProcedureDraft {
  return draft({
    name: "two_steps",
    description: "Two mutating steps.",
    steps: [step(0, "set_title", { title: "a" }), step(1, "set_priority", { priority: "p3" })],
    bindings: [
      {
        targetStepIndex: 0,
        targetPayloadPath: "title",
        source: "parameter",
        parameterKey: "title",
      },
      {
        targetStepIndex: 1,
        targetPayloadPath: "priority",
        source: "constant",
        frozenValue: "p3",
      },
    ],
  });
}

describe("compile execute bindings", () => {
  it("binds parameter, stepOutput, and constant then dispatches in order", async () => {
    const { catalogue, bus, record, dispatched } = boot();
    const tool = compile(
      draft({
        name: "copy_title",
        description: "Copy title then pin priority.",
        parameters: [],
        steps: [
          step(0, "get_record", {}),
          step(1, "set_title", { title: "placeholder" }),
          step(2, "set_priority", { priority: "p4" }),
        ],
        bindings: [
          {
            targetStepIndex: 1,
            targetPayloadPath: "title",
            source: "stepOutput",
            sourceStepIndex: 0,
            resultPath: "data.title",
          },
          {
            targetStepIndex: 2,
            targetPayloadPath: "priority",
            source: "constant",
            frozenValue: "p2",
          },
        ],
      }),
      catalogue,
      { bus },
    );
    record.title = "from-store";
    const raw = await tool.execute({}, { signal: new AbortController().signal });
    const summary = JSON.parse(raw);
    expect(dispatched.map((d) => d.id)).toEqual(["get_record", "set_title", "set_priority"]);
    expect(dispatched[1]?.payload["title"]).toBe("from-store");
    expect(dispatched[2]?.payload["priority"]).toBe("p2");
    expect(record.priority).toBe("p2");
    expect(summary.ok).toBe(true);
    expect(summary.steps).toHaveLength(3);
  });

  it("binds a call-time parameter onto the payload path", async () => {
    const { catalogue, bus, record } = boot();
    const tool = compile(draft(), catalogue, { bus });
    await tool.execute({ title: "agent-title" }, { signal: new AbortController().signal });
    expect(record.title).toBe("agent-title");
  });
});

describe("compile execute abort and summary", () => {
  it("honours AbortSignal between steps and before the first step", async () => {
    const { catalogue, bus, dispatched } = boot();
    const two = compile(twoStepDraft(), catalogue, { bus });
    const already = new AbortController();
    already.abort();
    await expect(
      two.execute({ title: "x" }, { signal: already.signal }),
    ).rejects.toThrow(/abort/i);
    expect(dispatched).toEqual([]);

    const mid = new AbortController();
    const wrapping = {
      dispatch(commandId: string, payload: Record<string, unknown>) {
        const result = bus.dispatch(commandId, payload);
        mid.abort();
        return result;
      },
      subscribe: bus.subscribe,
    };
    const midTool = compile(twoStepDraft(), catalogue, { bus: wrapping });
    await expect(midTool.execute({ title: "x" }, { signal: mid.signal })).rejects.toThrow(/abort/i);
    expect(dispatched.map((d) => d.id)).toEqual(["set_title"]);
  });

  it("truncates a compact summary over 1500 characters with a structured note", async () => {
    const catalogue = createCatalogue();
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
      handle: () => ({
        ok: true,
        summary: "z".repeat(2000),
        data: { title: "z" },
      }),
    });
    const tool = compile(draft(), catalogue, { bus: createBus(catalogue) });
    const raw = await tool.execute({ title: "z" }, { signal: new AbortController().signal });
    expect(raw.length).toBeLessThanOrEqual(1500);
    const parsed = JSON.parse(raw) as { note: { truncated: boolean; limit: number } };
    expect(parsed.note.truncated).toBe(true);
    expect(parsed.note.limit).toBe(1500);
  });
});

describe("compile capability allowlist", () => {
  it("dispatches only command ids from the recording, even if a foreign id is injected", async () => {
    const { catalogue, bus, dispatched, record } = boot();
    const source = draft();
    const tool = compile(source, catalogue, { bus });
    source.steps.push(step(1, "set_priority", { priority: "p1" }));
    await tool.execute(
      { title: "keep", commandId: "set_priority", priority: "p1" },
      { signal: new AbortController().signal },
    );
    expect(dispatched.map((d) => d.id)).toEqual(["set_title"]);
    expect(record.priority).toBe("p4");
    expect(record.title).toBe("keep");
  });
});

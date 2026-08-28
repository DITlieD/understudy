import { afterEach, describe, expect, it } from "vitest";
import type { PublishedProcedure } from "../model/types";
import type {
  ModelContext,
  ModelContextRegisterToolOptions,
  ModelContextTool,
  RegisteredTool,
} from "../webmcp/model-context";
import { ACTIVE_TOOL_CAP, TOOL_LIST_BUDGET_CHARS, createRegistry } from "./registry";
import type { Registry } from "./registry";

class FakeModelContext extends EventTarget implements ModelContext {
  ontoolchange: ((this: ModelContext, ev: Event) => unknown) | null = null;
  readonly tools = new Map<string, { tool: ModelContextTool; signal?: AbortSignal }>();

  async registerTool(tool: ModelContextTool, options: ModelContextRegisterToolOptions = {}) {
    if (this.tools.has(tool.name)) {
      throw new DOMException("duplicate tool name", "InvalidStateError");
    }
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
    }
    this.tools.set(tool.name, { tool, signal: options.signal });
    options.signal?.addEventListener("abort", () => {
      this.tools.delete(tool.name);
      this.emitChange();
    });
    this.emitChange();
  }

  async getTools(): Promise<RegisteredTool[]> {
    return [...this.tools.values()].map(({ tool }) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      window,
      origin: window.location.origin,
      annotations: tool.annotations,
    }));
  }

  async executeTool(
    tool: RegisteredTool,
    inputObject: Record<string, unknown> = {},
    options: { signal?: AbortSignal } = {},
  ) {
    const found = this.tools.get(tool.name);
    if (!found) {
      throw new DOMException("unknown tool", "NotFoundError");
    }
    const signal = options.signal ?? new AbortController().signal;
    const result = await found.tool.execute(inputObject, { signal });
    return typeof result === "string" ? result : JSON.stringify(result);
  }

  names() {
    return [...this.tools.keys()];
  }

  private emitChange() {
    const ev = new Event("toolchange");
    this.dispatchEvent(ev);
    this.ontoolchange?.call(this, ev);
  }
}

function installFake() {
  const fake = new FakeModelContext();
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: fake,
  });
  return fake;
}

function makeProc(name: string, description = "taught procedure"): PublishedProcedure {
  return {
    id: name,
    sourceTraceId: "trace-1",
    name,
    description,
    parameters: [
      {
        key: "queue",
        jsonType: "string",
        description: "Queue id.",
        required: true,
        sampleValue: "billing",
        sourceStepIndex: 0,
      },
    ],
    steps: [],
    bindings: [],
    computedAnnotations: { readOnlyHint: false, untrustedContentHint: true },
    validationErrors: [],
    publishedAt: "2026-08-27T00:00:00.000Z",
    approvedBy: "human",
    registrationId: name,
    invocationCount: 0,
    successCount: 0,
    lastError: null,
  };
}

function executeFor() {
  return async (_input: Record<string, unknown>, { signal }: { signal: AbortSignal }) => {
    if (signal.aborted) {
      throw signal.reason ?? new DOMException("Aborted", "AbortError");
    }
    return { ok: true, summary: "done" };
  };
}

function memoryPersist(initial: PublishedProcedure[] = []) {
  let items = [...initial];
  return {
    loadPublished: () => items,
    savePublished: (next: PublishedProcedure[]) => {
      items = [...next];
    },
    dump: () => items,
  };
}

let registry: Registry | undefined;

afterEach(() => {
  registry?.dispose();
  registry = undefined;
  Reflect.deleteProperty(document, "modelContext");
});

describe("registry with WebMCP", () => {
  it("registers a tool through document.modelContext.registerTool", async () => {
    const fake = installFake();
    registry = createRegistry({ executeFor });
    await registry.publish(makeProc("triage_p2"));
    expect(fake.names()).toEqual(["triage_p2"]);
    const slot = fake.tools.get("triage_p2");
    expect(slot?.signal).toBeInstanceOf(AbortSignal);
    expect(slot?.tool.annotations).toEqual({
      readOnlyHint: false,
      untrustedContentHint: true,
    });
  });

  it("revokes by aborting the per-tool controller", async () => {
    const fake = installFake();
    registry = createRegistry({ executeFor });
    await registry.publish(makeProc("triage_p2"));
    expect("unregisterTool" in fake).toBe(false);
    await registry.revoke("triage_p2");
    expect(fake.names()).toEqual([]);
    expect(registry.list()).toEqual([]);
  });

  it("rejects a duplicate name", async () => {
    const fake = installFake();
    registry = createRegistry({ executeFor });
    await registry.publish(makeProc("dup"));
    await expect(registry.publish(makeProc("dup"))).rejects.toThrow(/duplicate tool: dup/i);
    expect(fake.names()).toEqual(["dup"]);
  });

  it("enforces the active tool cap", async () => {
    expect(ACTIVE_TOOL_CAP).toBe(16);
    const fake = installFake();
    registry = createRegistry({ executeFor });
    for (let i = 0; i < ACTIVE_TOOL_CAP; i += 1) {
      await registry.publish(makeProc(`t${i}`));
    }
    await expect(registry.publish(makeProc("overflow"))).rejects.toThrow(/active tool cap: 16/i);
    expect(fake.names()).toHaveLength(ACTIVE_TOOL_CAP);
  });

  it("reports budget consumption and warns as the cap approaches", async () => {
    installFake();
    registry = createRegistry({ executeFor });
    await registry.publish(makeProc("one"));
    const early = registry.getBudget();
    expect(early.active).toBe(1);
    expect(early.consumed).toBeGreaterThan(0);
    expect(early.used).toBe(early.consumed);
    expect(early.budget).toBe(TOOL_LIST_BUDGET_CHARS);
    expect(early.cap).toBe(TOOL_LIST_BUDGET_CHARS);
    expect(early.budget).toBeGreaterThan(early.consumed);
    expect(early.warning).toBe(false);
    for (let i = 1; i < 14; i += 1) {
      await registry.publish(makeProc(`n${i}`));
    }
    const late = registry.getBudget();
    expect(late.active).toBe(14);
    expect(late.warning).toBe(true);
  });

  it("keeps the inspector snapshot truthful after toolchange", async () => {
    installFake();
    registry = createRegistry({ executeFor });
    await registry.publish(makeProc("alpha"));
    expect(registry.snapshot().degraded).toBe(false);
    expect(registry.snapshot().host?.map((tool) => tool.name)).toEqual(["alpha"]);
    await registry.revoke("alpha");
    expect(registry.snapshot().host).toEqual([]);
    expect(registry.snapshot().published).toEqual([]);
  });

  it("re-registers tools returned by loadPublished", async () => {
    const fake = installFake();
    const persist = memoryPersist([makeProc("restored")]);
    registry = createRegistry({ executeFor, persist });
    await registry.restore();
    expect(fake.names()).toEqual(["restored"]);
    expect(registry.list().map((item) => item.name)).toEqual(["restored"]);
  });

  it("disable aborts registration and enable re-registers without dropping persist", async () => {
    const fake = installFake();
    const persist = memoryPersist();
    registry = createRegistry({ executeFor, persist });
    await registry.publish(makeProc("kept"));
    const prior = fake.tools.get("kept")?.signal;
    await registry.setEnabled("kept", false);
    expect(prior?.aborted).toBe(true);
    expect(fake.names()).toEqual([]);
    expect(registry.isEnabled("kept")).toBe(false);
    expect(registry.list().map((item) => item.name)).toEqual(["kept"]);
    expect(persist.dump().map((item) => item.name)).toEqual(["kept"]);
    expect(registry.getBudget().active).toBe(0);
    await registry.setEnabled("kept", true);
    expect(fake.names()).toEqual(["kept"]);
    expect(registry.isEnabled("kept")).toBe(true);
    expect(fake.tools.get("kept")?.signal).not.toBe(prior);
    expect(persist.dump().map((item) => item.name)).toEqual(["kept"]);
  });

  it("replace aborts the old controller and registers the same name", async () => {
    const fake = installFake();
    registry = createRegistry({ executeFor });
    const first = makeProc("same");
    await registry.publish(first);
    const prior = fake.tools.get("same")?.signal;
    await registry.replace({ ...first, description: "Updated procedure." });
    expect(prior?.aborted).toBe(true);
    expect(fake.names()).toEqual(["same"]);
    expect(registry.list()[0]?.description).toBe("Updated procedure.");
    expect(fake.tools.get("same")?.signal).not.toBe(prior);
  });

  it("disabled tools do not count toward the active cap", async () => {
    const fake = installFake();
    registry = createRegistry({ executeFor });
    for (let i = 0; i < ACTIVE_TOOL_CAP; i += 1) {
      await registry.publish(makeProc(`t${i}`));
    }
    await registry.setEnabled("t0", false);
    await registry.publish(makeProc("extra"));
    expect(fake.names()).toHaveLength(ACTIVE_TOOL_CAP);
    await expect(registry.setEnabled("t0", true)).rejects.toThrow(/active tool cap: 16/i);
  });
});

describe("registry without WebMCP", () => {
  it("tracks published tools in memory and reports degraded", async () => {
    expect(document.modelContext).toBeUndefined();
    const persist = memoryPersist();
    registry = createRegistry({ executeFor, persist });
    await registry.publish(makeProc("human_only"));
    expect(registry.snapshot().degraded).toBe(true);
    expect(registry.snapshot().host).toBeNull();
    expect(registry.list().map((item) => item.name)).toEqual(["human_only"]);
    expect(persist.dump().map((item) => item.name)).toEqual(["human_only"]);
    await registry.revoke("human_only");
    expect(registry.list()).toEqual([]);
    expect(persist.dump()).toEqual([]);
  });
});

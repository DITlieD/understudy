import type {
  ModelContext,
  ModelContextRegisterToolOptions,
  ModelContextTool,
  RegisteredTool,
} from "../webmcp/model-context";

export class FakeModelContext extends EventTarget implements ModelContext {
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

export function installFakeModelContext() {
  const fake = new FakeModelContext();
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: fake,
  });
  return fake;
}

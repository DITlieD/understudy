export type ToolAnnotations = {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
};

export type ToolExecuteCallbackOptions = {
  signal: AbortSignal;
};

export type ToolExecuteCallback = (
  inputObject: Record<string, unknown>,
  options: ToolExecuteCallbackOptions,
) => Promise<unknown>;

export type ModelContextTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  execute: ToolExecuteCallback;
  annotations?: ToolAnnotations;
};

export type ModelContextRegisterToolOptions = {
  exposedTo?: string[];
  signal?: AbortSignal;
};

export type ModelContextGetToolOptions = {
  fromOrigins?: string[];
};

export type ModelContextExecuteToolOptions = {
  signal?: AbortSignal;
};

export type RegisteredTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  window: Window;
  origin: string;
  annotations?: ToolAnnotations;
};

export interface ModelContext extends EventTarget {
  registerTool(
    tool: ModelContextTool,
    options?: ModelContextRegisterToolOptions,
  ): Promise<void>;
  getTools(options?: ModelContextGetToolOptions): Promise<RegisteredTool[]>;
  executeTool(
    tool: RegisteredTool,
    inputObject?: Record<string, unknown>,
    options?: ModelContextExecuteToolOptions,
  ): Promise<string>;
  ontoolchange: ((this: ModelContext, ev: Event) => unknown) | null;
}

declare global {
  interface Document {
    readonly modelContext?: ModelContext;
  }
}

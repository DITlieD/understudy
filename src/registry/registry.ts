import type { JsonSchema, JsonSchemaProperty, PublishedProcedure } from "../model/types";
import { detectModelContext, listenToolchange } from "../webmcp";
import type {
  ModelContext,
  ModelContextTool,
  RegisteredTool,
  ToolExecuteCallback,
} from "../webmcp/model-context";

export const ACTIVE_TOOL_CAP = 16;
export const TOOL_LIST_BUDGET_CHARS = ACTIVE_TOOL_CAP * (30 + 500);

const WARNING_ACTIVE = ACTIVE_TOOL_CAP - 2;
const WARNING_CHARS = TOOL_LIST_BUDGET_CHARS * 0.8;

export type PersistHooks = {
  loadPublished: () => PublishedProcedure[] | Promise<PublishedProcedure[]>;
  savePublished: (items: PublishedProcedure[]) => void | Promise<void>;
};

export type ExecuteFor = (procedure: PublishedProcedure) => ToolExecuteCallback;

export type RegistryOptions = {
  executeFor: ExecuteFor;
  persist?: PersistHooks;
  document?: Document;
};

export type Budget = {
  consumed: number;
  used: number;
  budget: number;
  cap: number;
  active: number;
  warning: boolean;
};

export type InspectorSnapshot = {
  degraded: boolean;
  published: { name: string; description: string }[];
  host: { name: string; description: string }[] | null;
};

export type Registry = {
  publish: (procedure: PublishedProcedure) => Promise<void>;
  replace: (procedure: PublishedProcedure) => Promise<void>;
  revoke: (name: string) => Promise<void>;
  restore: () => Promise<void>;
  list: () => PublishedProcedure[];
  setEnabled: (name: string, enabled: boolean) => Promise<void>;
  isEnabled: (name: string) => boolean;
  getBudget: () => Budget;
  snapshot: () => InspectorSnapshot;
  dispose: () => void;
};

type Slot = {
  procedure: PublishedProcedure;
  controller: AbortController;
};

export function createRegistry(options: RegistryOptions): Registry {
  const ctx = detectModelContext(options.document ?? document);
  const degraded = ctx === null;
  const slots = new Map<string, Slot>();
  let host: RegisteredTool[] | null = degraded ? null : [];
  let stopListen: (() => void) | undefined;

  if (ctx) {
    stopListen = listenToolchange(ctx, () => {
      void refreshHost(ctx);
    });
  }

  async function refreshHost(model: ModelContext) {
    host = await model.getTools();
  }

  function list(): PublishedProcedure[] {
    return [...slots.values()].map((slot) => slot.procedure);
  }

  function activeSlots(): Slot[] {
    return [...slots.values()].filter((slot) => !slot.controller.signal.aborted);
  }

  function requireSlot(name: string): Slot {
    const slot = slots.get(name);
    if (!slot) {
      throw new Error(`unknown tool: ${name}`);
    }
    return slot;
  }

  async function persistSave() {
    if (!options.persist) {
      return;
    }
    await options.persist.savePublished(list());
  }

  async function registerSlot(procedure: PublishedProcedure) {
    if (!procedure.name) {
      throw new Error("empty tool name");
    }
    if (slots.has(procedure.name)) {
      throw new Error(`duplicate tool: ${procedure.name}`);
    }
    if (activeSlots().length >= ACTIVE_TOOL_CAP) {
      throw new Error(`active tool cap: ${ACTIVE_TOOL_CAP}`);
    }
    const controller = new AbortController();
    if (ctx) {
      await ctx.registerTool(toTool(procedure, options.executeFor), {
        signal: controller.signal,
      });
      await refreshHost(ctx);
    }
    slots.set(procedure.name, { procedure, controller });
  }

  return {
    async publish(procedure: PublishedProcedure) {
      await registerSlot(procedure);
      await persistSave();
    },
    async replace(procedure: PublishedProcedure) {
      const existing = slots.get(procedure.name);
      if (existing) {
        existing.controller.abort();
        slots.delete(procedure.name);
      }
      await registerSlot(procedure);
      await persistSave();
    },
    async revoke(name: string) {
      const slot = slots.get(name);
      if (!slot) {
        throw new Error(`unknown tool: ${name}`);
      }
      slot.controller.abort();
      slots.delete(name);
      if (ctx) {
        await refreshHost(ctx);
      }
      await persistSave();
    },
    async restore() {
      if (!options.persist) {
        return;
      }
      const items = await options.persist.loadPublished();
      for (const procedure of items) {
        await registerSlot(procedure);
      }
    },
    list,
    async setEnabled(name: string, enabled: boolean) {
      const slot = requireSlot(name);
      if (enabled) {
        if (!slot.controller.signal.aborted) {
          return;
        }
        if (activeSlots().length >= ACTIVE_TOOL_CAP) {
          throw new Error(`active tool cap: ${ACTIVE_TOOL_CAP}`);
        }
        const controller = new AbortController();
        if (ctx) {
          await ctx.registerTool(toTool(slot.procedure, options.executeFor), {
            signal: controller.signal,
          });
          await refreshHost(ctx);
        }
        slot.controller = controller;
        return;
      }
      if (slot.controller.signal.aborted) {
        return;
      }
      slot.controller.abort();
      if (ctx) {
        await refreshHost(ctx);
      }
    },
    isEnabled(name: string) {
      return !requireSlot(name).controller.signal.aborted;
    },
    getBudget() {
      return measureBudget(activeSlots().map((slot) => slot.procedure));
    },
    snapshot() {
      return {
        degraded,
        published: list().map((procedure) => ({
          name: procedure.name,
          description: procedure.description,
        })),
        host:
          host === null
            ? null
            : host.map((tool) => ({
                name: tool.name,
                description: tool.description,
              })),
      };
    },
    dispose() {
      stopListen?.();
    },
  };
}

export function getBudget(procedures: PublishedProcedure[]): Budget {
  return measureBudget(procedures);
}

function measureBudget(procedures: PublishedProcedure[]): Budget {
  let consumed = 0;
  for (const procedure of procedures) {
    consumed +=
      procedure.name.length +
      procedure.description.length +
      JSON.stringify(schemaOf(procedure)).length;
  }
  return {
    consumed,
    used: consumed,
    budget: TOOL_LIST_BUDGET_CHARS,
    cap: TOOL_LIST_BUDGET_CHARS,
    active: procedures.length,
    warning: procedures.length >= WARNING_ACTIVE || consumed >= WARNING_CHARS,
  };
}

function toTool(procedure: PublishedProcedure, executeFor: ExecuteFor): ModelContextTool {
  return {
    name: procedure.name,
    description: procedure.description,
    inputSchema: schemaOf(procedure),
    annotations: procedure.computedAnnotations,
    execute: executeFor(procedure),
  };
}

function schemaOf(procedure: PublishedProcedure): JsonSchema {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];
  for (const parameter of procedure.parameters) {
    const property: JsonSchemaProperty = {
      type: parameter.jsonType,
      description: parameter.description,
    };
    if (parameter.enumValues && parameter.enumValues.length > 0) {
      property.enum = parameter.enumValues;
    }
    properties[parameter.key] = property;
    if (parameter.required) {
      required.push(parameter.key);
    }
  }
  const schema: JsonSchema = { type: "object", properties };
  if (required.length > 0) {
    schema.required = required;
  }
  return schema;
}

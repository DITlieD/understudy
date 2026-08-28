import type { JsonSchema, JsonType } from "../model/types";

export type Leaf = { path: string; value: unknown };

export function walkLeaves(value: unknown, prefix = ""): Leaf[] {
  if (value === null || value === undefined) {
    return prefix === "" ? [] : [{ path: prefix, value }];
  }
  if (typeof value !== "object") {
    return prefix === "" ? [] : [{ path: prefix, value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      walkLeaves(item, prefix === "" ? String(index) : `${prefix}.${index}`),
    );
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.flatMap(([key, child]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (child !== null && typeof child === "object") {
      const nested = walkLeaves(child, path);
      return nested.length > 0 ? nested : [{ path, value: child }];
    }
    return [{ path, value: child }];
  });
}

export function leafName(path: string): string {
  const parts = path.split(".");
  return parts[parts.length - 1] ?? path;
}

export function isEntityIdPath(path: string): boolean {
  const leaf = leafName(path);
  return (
    /^(id|recordId|ticketId|entityId|record_id|ticket_id|entity_id)$/i.test(leaf) ||
    /Id$/.test(leaf) ||
    /_id$/.test(leaf)
  );
}

export function originApplies(path: string, sourceField: string | null): boolean {
  if (sourceField === null) {
    return true;
  }
  return path === sourceField || path.startsWith(`${sourceField}.`);
}

export function parseDerivedControl(
  sourceControl: string,
): { sourceStepIndex: number; resultPath?: string } | null {
  const match = /^step:(\d+)(?:\/(.+))?$/.exec(sourceControl);
  if (!match) {
    return null;
  }
  const sourceStepIndex = Number(match[1]);
  const resultPath = match[2];
  if (resultPath) {
    return { sourceStepIndex, resultPath };
  }
  return { sourceStepIndex };
}

export function nearestBefore(index: number, candidates: number[]): number | undefined {
  let found: number | undefined;
  for (const candidate of candidates) {
    if (candidate < index) {
      found = candidate;
    }
  }
  return found;
}

export type SchemaInfo = {
  jsonType?: JsonType;
  enumValues?: string[];
  description?: string;
  required: boolean;
};

export function schemaInfo(schema: JsonSchema, path: string): SchemaInfo {
  const requiredList = schema.required ?? [];
  const exact = schema.properties[path];
  if (exact) {
    return {
      jsonType: exact.type,
      enumValues: exact.enum,
      description: exact.description,
      required: requiredList.includes(path),
    };
  }
  const top = path.split(".")[0] ?? path;
  const topProp = schema.properties[top];
  return {
    jsonType:
      topProp && topProp.type !== "object" && topProp.type !== "array" ? topProp.type : undefined,
    required: requiredList.includes(path) || requiredList.includes(top),
  };
}

export function inferJsonType(value: unknown, schemaType?: JsonType): JsonType {
  if (schemaType && schemaType !== "object" && schemaType !== "array") {
    return schemaType;
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (value !== null && typeof value === "object") {
    return "object";
  }
  return "string";
}

export function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (left === undefined || right === undefined) {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

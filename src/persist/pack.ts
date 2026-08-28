import type { PublishedProcedure, ToolPack } from "../model/types";

export const PACK_VERSION = 1;
export const SOURCE_APP_VERSION = "0.1.0";

export type IdCatalogue = {
  list: () => ReadonlyArray<{ id: string }>;
};

export function exportPack(
  procedures: PublishedProcedure[],
  catalogue: IdCatalogue,
): ToolPack {
  const requiredCommandIds = usedCommandIds(procedures);
  const missing = missingFromCatalogue(requiredCommandIds, catalogue);
  if (missing.length > 0) {
    throw new Error(`export refused: missing commands: ${missing.join(", ")}`);
  }
  return {
    packVersion: PACK_VERSION,
    exportedAt: new Date().toISOString(),
    sourceAppVersion: SOURCE_APP_VERSION,
    requiredCommandIds,
    procedures: structuredClone(procedures),
  };
}

export function importPack(json: unknown, catalogue: IdCatalogue): PublishedProcedure[] {
  const pack = parsePack(json);
  if (pack.packVersion !== PACK_VERSION) {
    throw new Error(`unsupported packVersion: ${pack.packVersion}`);
  }
  const missing = missingFromCatalogue(pack.requiredCommandIds, catalogue);
  if (missing.length > 0) {
    throw new Error(`import refused: missing commands: ${missing.join(", ")}`);
  }
  const declared = new Set(pack.requiredCommandIds);
  const undeclared = usedCommandIds(pack.procedures).filter((id) => !declared.has(id));
  if (undeclared.length > 0) {
    throw new Error(`import refused: undeclared commands: ${undeclared.join(", ")}`);
  }
  return structuredClone(pack.procedures);
}

function missingFromCatalogue(ids: string[], catalogue: IdCatalogue): string[] {
  const available = new Set(catalogue.list().map((command) => command.id));
  return ids.filter((id) => !available.has(id));
}

function usedCommandIds(procedures: PublishedProcedure[]): string[] {
  const ids = new Set<string>();
  for (const procedure of procedures) {
    if (!procedure || !Array.isArray(procedure.steps)) {
      throw new Error("invalid pack json");
    }
    for (const step of procedure.steps) {
      if (typeof step.commandId !== "string") {
        throw new Error("invalid pack json");
      }
      ids.add(step.commandId);
    }
  }
  return [...ids].sort();
}

function parsePack(json: unknown): ToolPack {
  let value = json;
  if (typeof json === "string") {
    try {
      value = JSON.parse(json) as unknown;
    } catch {
      throw new Error("invalid pack json");
    }
  }
  if (!isToolPack(value)) {
    throw new Error("invalid pack json");
  }
  return value;
}

function isToolPack(value: unknown): value is ToolPack {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const pack = value as Record<string, unknown>;
  return (
    typeof pack.packVersion === "number" &&
    typeof pack.exportedAt === "string" &&
    typeof pack.sourceAppVersion === "string" &&
    Array.isArray(pack.requiredCommandIds) &&
    pack.requiredCommandIds.every((id) => typeof id === "string") &&
    Array.isArray(pack.procedures)
  );
}

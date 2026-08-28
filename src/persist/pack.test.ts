import { describe, expect, it, vi } from "vitest";
import type { PublishedProcedure } from "../model/types";
import { PACK_VERSION, SOURCE_APP_VERSION, exportPack, importPack } from "./index";

function procedure(id: string, commandIds: string[]): PublishedProcedure {
  return {
    id,
    sourceTraceId: "tr-1",
    name: id,
    description: `tool ${id}`,
    parameters: [],
    steps: commandIds.map((commandId, index) => ({
      index,
      commandId,
      payload: {},
      provenance: {
        sourceControl: commandId,
        sourceField: null,
        valueOrigin: "constant",
      },
      resultSummary: "ok",
    })),
    bindings: [],
    computedAnnotations: { readOnlyHint: false, untrustedContentHint: false },
    validationErrors: [],
    publishedAt: "2026-08-27T01:00:00.000Z",
    approvedBy: "mara",
    registrationId: `reg-${id}`,
    invocationCount: 2,
    successCount: 2,
    lastError: null,
  };
}

function catalogue(ids: string[]) {
  return {
    list: () => ids.map((id) => ({ id })),
  };
}

describe("exportPack", () => {
  it("emits a versioned pack with derived requiredCommandIds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T09:19:00.000Z"));
    const escalate = procedure("escalate", ["set_priority", "add_tag"]);
    const retitle = procedure("retitle", ["set_title", "add_tag"]);
    const pack = exportPack([escalate, retitle], catalogue(["set_priority", "add_tag", "set_title"]));
    expect(pack).toEqual({
      packVersion: PACK_VERSION,
      exportedAt: "2026-08-27T09:19:00.000Z",
      sourceAppVersion: SOURCE_APP_VERSION,
      requiredCommandIds: ["add_tag", "set_priority", "set_title"],
      procedures: [escalate, retitle],
    });
    vi.useRealTimers();
  });
});

describe("importPack", () => {
  it("returns procedures when every required command exists", () => {
    const escalate = procedure("escalate", ["set_priority"]);
    const pack = exportPack([escalate], catalogue(["set_priority"]));
    const imported = importPack(pack, catalogue(["set_priority", "add_tag"]));
    expect(imported).toEqual([escalate]);
  });

  it("accepts a JSON string", () => {
    const escalate = procedure("escalate", ["set_priority"]);
    const pack = exportPack([escalate], catalogue(["set_priority"]));
    const imported = importPack(JSON.stringify(pack), catalogue(["set_priority"]));
    expect(imported).toEqual([escalate]);
  });

  it("refuses the whole pack when a required command is missing", () => {
    const pack = exportPack(
      [procedure("escalate", ["set_priority"])],
      catalogue(["set_priority"]),
    );
    expect(() => importPack(pack, catalogue(["set_title"]))).toThrow(
      /import refused: missing commands: set_priority/i,
    );
  });

  it("refuses partial imports when only some procedures can run", () => {
    const pack = exportPack(
      [procedure("escalate", ["set_priority"]), procedure("retitle", ["set_title"])],
      catalogue(["set_priority", "set_title"]),
    );
    expect(() => importPack(pack, catalogue(["set_priority"]))).toThrow(
      /import refused: missing commands: set_title/i,
    );
    expect(() => importPack(pack, catalogue(["set_priority"]))).toThrow(/set_title/);
  });

  it("refuses undeclared command ids used by procedures", () => {
    const pack = exportPack(
      [procedure("escalate", ["set_priority"])],
      catalogue(["set_priority"]),
    );
    pack.procedures[0]?.steps.push({
      index: 1,
      commandId: "bulk_delete",
      payload: {},
      provenance: {
        sourceControl: "danger",
        sourceField: null,
        valueOrigin: "constant",
      },
      resultSummary: "ok",
    });
    expect(() => importPack(pack, catalogue(["set_priority", "bulk_delete"]))).toThrow(
      /import refused: undeclared commands: bulk_delete/i,
    );
  });

  it("fails fast on unsupported packVersion", () => {
    const pack = exportPack(
      [procedure("escalate", ["set_priority"])],
      catalogue(["set_priority"]),
    );
    expect(() =>
      importPack({ ...pack, packVersion: 2 }, catalogue(["set_priority"])),
    ).toThrow(/unsupported packVersion: 2/i);
  });

  it("fails fast on invalid JSON", () => {
    expect(() => importPack("{", catalogue(["set_priority"]))).toThrow(/invalid pack json/i);
  });
});

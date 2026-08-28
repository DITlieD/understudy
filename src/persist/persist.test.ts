import { describe, expect, it } from "vitest";
import type { AuditEntry, ProcedureDraft, PublishedProcedure, Trace } from "../model/types";
import { createMemoryDriver, createPersistence, exportAuditLog } from "./index";

function trace(id: string, label = id): Trace {
  return {
    id,
    label,
    createdAt: "2026-08-27T00:00:00.000Z",
    authorLabel: "mara",
    focusContext: { recordId: "t-1" },
    steps: [
      {
        index: 0,
        commandId: "set_title",
        payload: { title: "billing" },
        provenance: {
          sourceControl: "title-input",
          sourceField: "title",
          valueOrigin: "typed",
        },
        resultSummary: "ok",
      },
    ],
    status: "raw",
  };
}

function draft(id: string): ProcedureDraft {
  return {
    id,
    sourceTraceId: "tr-1",
    name: "n",
    description: "d",
    parameters: [],
    steps: [],
    bindings: [],
    computedAnnotations: { readOnlyHint: true, untrustedContentHint: false },
    validationErrors: [],
  };
}

function published(id: string, commandId = "set_priority"): PublishedProcedure {
  return {
    ...draft(id),
    steps: [
      {
        index: 0,
        commandId,
        payload: { priority: "p2" },
        provenance: {
          sourceControl: "priority",
          sourceField: "priority",
          valueOrigin: "picked",
        },
        resultSummary: "ok",
      },
    ],
    publishedAt: "2026-08-27T01:00:00.000Z",
    approvedBy: "mara",
    registrationId: `reg-${id}`,
    invocationCount: 0,
    successCount: 0,
    lastError: null,
  };
}

function audit(timestamp: string, action = "invoke"): AuditEntry {
  return {
    timestamp,
    actor: "agent",
    action,
    toolName: "escalate_p2",
    argsDigest: "abc",
    outcome: "ok",
  };
}

function boot() {
  return createPersistence(createMemoryDriver());
}

describe("persistence stores", () => {
  it("saves, loads, lists, and deletes a trace", async () => {
    const db = boot();
    const item = trace("tr-1", "weekly sweep");
    await db.traces.save(item);
    expect(await db.traces.load("tr-1")).toEqual(item);
    expect(await db.traces.list()).toEqual([item]);
    await db.traces.delete("tr-1");
    expect(await db.traces.load("tr-1")).toBeUndefined();
    expect(await db.traces.list()).toEqual([]);
  });

  it("saves, loads, lists, and deletes a draft", async () => {
    const db = boot();
    const item = draft("dr-1");
    await db.drafts.save(item);
    expect(await db.drafts.load("dr-1")).toEqual(item);
    expect(await db.drafts.list()).toEqual([item]);
    await db.drafts.delete("dr-1");
    expect(await db.drafts.load("dr-1")).toBeUndefined();
  });

  it("saves, loads, lists, and deletes a published procedure", async () => {
    const db = boot();
    const item = published("pr-1");
    await db.published.save(item);
    expect(await db.published.load("pr-1")).toEqual(item);
    expect(await db.published.list()).toEqual([item]);
    await db.published.delete("pr-1");
    expect(await db.published.list()).toEqual([]);
  });

  it("saves, loads, lists, and deletes an audit entry keyed by timestamp", async () => {
    const db = boot();
    const item = audit("2026-08-27T02:00:00.000Z");
    await db.audit.save(item);
    expect(await db.audit.load("2026-08-27T02:00:00.000Z")).toEqual(item);
    expect(await db.audit.list()).toEqual([item]);
    await db.audit.delete("2026-08-27T02:00:00.000Z");
    expect(await db.audit.load("2026-08-27T02:00:00.000Z")).toBeUndefined();
  });

  it("keeps the four stores isolated", async () => {
    const db = boot();
    await db.traces.save(trace("same"));
    await db.drafts.save(draft("same"));
    await db.published.save(published("same"));
    await db.audit.save(audit("same"));
    expect((await db.traces.load("same"))?.label).toBe("same");
    expect((await db.drafts.load("same"))?.name).toBe("n");
    expect((await db.published.load("same"))?.approvedBy).toBe("mara");
    expect((await db.audit.load("same"))?.actor).toBe("agent");
  });

  it("overwrites an existing id on save", async () => {
    const db = boot();
    await db.traces.save(trace("tr-1", "one"));
    await db.traces.save(trace("tr-1", "two"));
    expect((await db.traces.load("tr-1"))?.label).toBe("two");
    expect(await db.traces.list()).toHaveLength(1);
  });

  it("fails fast when saving a record with an empty id", async () => {
    const db = boot();
    await expect(db.traces.save(trace(""))).rejects.toThrow(/empty id/i);
  });

  it("does not leak mutations through the stored snapshot", async () => {
    const db = boot();
    const item = trace("tr-1");
    await db.traces.save(item);
    item.label = "mutated";
    const loaded = await db.traces.load("tr-1");
    expect(loaded?.label).toBe("tr-1");
    if (!loaded) {
      throw new Error("expected loaded trace");
    }
    loaded.label = "also mutated";
    expect((await db.traces.load("tr-1"))?.label).toBe("tr-1");
  });

  it("does not share data across memory drivers", async () => {
    const a = createPersistence(createMemoryDriver());
    const b = createPersistence(createMemoryDriver());
    await a.traces.save(trace("tr-1"));
    expect(await b.traces.list()).toEqual([]);
  });
});

describe("audit log export", () => {
  it("exports saved audit entries as JSON", async () => {
    const db = boot();
    const first = audit("2026-08-27T02:00:00.000Z", "publish");
    const second = audit("2026-08-27T02:01:00.000Z", "invoke");
    await db.audit.save(first);
    await db.audit.save(second);
    const json = await db.exportAuditJson();
    expect(JSON.parse(json)).toEqual([first, second]);
    expect(exportAuditLog([first, second])).toBe(json);
  });
});

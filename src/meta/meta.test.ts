import { describe, expect, it } from "vitest";
import type { AuditEntry, Parameter, ProcedureDraft, Trace } from "../model/types";
import { DRAFT_NEXT_STEP, LIST_NEXT_STEP, createMetaTools } from "../meta";
import type { MetaPorts } from "../meta";
import type { ApprovalDecision, ApprovalPrompt } from "../safety";
import { APPROVAL_TIMEOUT_MS } from "../safety";
import type { ModelContextTool } from "../webmcp/model-context";

function sampleTrace(overrides: Partial<Trace> = {}): Trace {
  return {
    id: "rec-1",
    label: "weekly escalation",
    createdAt: "2026-08-27T00:00:00.000Z",
    authorLabel: "mara",
    focusContext: { recordId: "tkt-40" },
    status: "raw",
    steps: [
      {
        index: 0,
        commandId: "set_priority",
        payload: { priority: "p2" },
        provenance: {
          sourceControl: "priority-picker",
          sourceField: "priority",
          valueOrigin: "picked",
        },
        resultSummary: "priority set to p2",
      },
      {
        index: 1,
        commandId: "add_tag",
        payload: { tag: "billing" },
        provenance: {
          sourceControl: "tag-input",
          sourceField: "tag",
          valueOrigin: "typed",
        },
        resultSummary: "tag added billing",
      },
    ],
    ...overrides,
  };
}

function sampleDraft(overrides: Partial<ProcedureDraft> = {}): ProcedureDraft {
  const trace = sampleTrace();
  return {
    id: "draft-1",
    sourceTraceId: trace.id,
    name: "escalate_billing",
    description: "Escalate a billing ticket.",
    parameters: [
      {
        key: "priority",
        jsonType: "string",
        description: "Priority to set.",
        required: true,
        enumValues: ["p1", "p2", "p3", "p4"],
        sampleValue: "p2",
        sourceStepIndex: 0,
      },
    ],
    steps: trace.steps,
    bindings: [
      {
        targetStepIndex: 0,
        targetPayloadPath: "priority",
        source: "parameter",
        parameterKey: "priority",
      },
    ],
    computedAnnotations: { readOnlyHint: false, untrustedContentHint: false },
    validationErrors: [],
    ...overrides,
  };
}

function candidates(): Parameter[] {
  return [
    {
      key: "priority",
      jsonType: "string",
      description: "",
      required: true,
      sampleValue: "p2",
      sourceStepIndex: 0,
    },
  ];
}

function createTestClock() {
  let now = 0;
  const waiting: { due: number; resolve: () => void }[] = [];
  return {
    now: () => now,
    wait(ms: number) {
      return new Promise<void>((resolve) => {
        waiting.push({ due: now + ms, resolve });
      });
    },
    async advance(ms: number) {
      now += ms;
      const due = waiting.filter((item) => item.due <= now);
      const rest = waiting.filter((item) => item.due > now);
      waiting.length = 0;
      waiting.push(...rest);
      for (const item of due) {
        item.resolve();
      }
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

function deferredUi() {
  let resolveDecision: ((decision: ApprovalDecision) => void) | undefined;
  const prompts: ApprovalPrompt[] = [];
  return {
    prompts,
    request(prompt: ApprovalPrompt) {
      prompts.push(prompt);
      return new Promise<ApprovalDecision>((resolve) => {
        resolveDecision = resolve;
      });
    },
    resolve(decision: ApprovalDecision) {
      if (!resolveDecision) {
        throw new Error("no pending approval");
      }
      const resolve = resolveDecision;
      resolveDecision = undefined;
      resolve(decision);
    },
  };
}

function payload(text: unknown) {
  if (typeof text !== "string") {
    throw new Error("expected string result");
  }
  const line = text.split("\n")[0] ?? text;
  return JSON.parse(line) as Record<string, unknown>;
}

function named(tools: ModelContextTool[], name: string): ModelContextTool {
  const found = tools.find((item) => item.name === name);
  if (!found) {
    throw new Error(`missing tool ${name}`);
  }
  return found;
}

function signal() {
  return { signal: new AbortController().signal };
}

function boot(overrides: Partial<MetaPorts> = {}) {
  const traces = [
    sampleTrace(),
    sampleTrace({ id: "rec-done", status: "converted", label: "already shipped" }),
  ];
  const drafts = new Map<string, ProcedureDraft>();
  const registered: string[] = [];
  const audits: AuditEntry[] = [];
  const clock = createTestClock();
  const ui = deferredUi();
  const ports: MetaPorts = {
    listTraces: () => traces,
    getTrace: (id) => traces.find((item) => item.id === id),
    proposeCandidates: () => candidates(),
    createDraft: ({ trace, name, description, parameterDescriptions }) => {
      const created = sampleDraft({
        id: "draft-1",
        sourceTraceId: trace.id,
        name,
        description,
        parameters: candidates().map((item) => ({
          ...item,
          description: parameterDescriptions[item.key] ?? "",
        })),
      });
      drafts.set(created.id, created);
      return created;
    },
    getDraft: (id) => drafts.get(id),
    validate: () => [],
    dryRun: () => ({
      steps: [
        {
          index: 0,
          commandId: "set_priority",
          resolvedPayload: { priority: "p1", ticketId: "tkt-99" },
        },
      ],
    }),
    register: (draft) => {
      registered.push(draft.id);
      return { registrationId: `reg-${draft.id}` };
    },
    clock,
    approvalUi: ui,
    persistAudit: (entry) => {
      audits.push(entry);
    },
    ...overrides,
  };
  return {
    tools: createMetaTools(ports),
    traces,
    drafts,
    registered,
    audits,
    clock,
    ui,
    ports,
  };
}

describe("understudy_list_recordings", () => {
  it("enumerates unconverted recordings with step counts and one-line summaries", async () => {
    const { tools } = boot();
    const list = named(tools, "understudy_list_recordings");
    expect(list.annotations?.readOnlyHint).toBe(true);
    const text = await list.execute({}, signal());
    expect(typeof text).toBe("string");
    expect(String(text).endsWith(LIST_NEXT_STEP)).toBe(true);
    const body = payload(text);
    expect(body["recordings"]).toEqual([
      {
        id: "rec-1",
        label: "weekly escalation",
        stepCount: 2,
        summary: "weekly escalation: set_priority, add_tag",
      },
    ]);
    expect(String((body["recordings"] as { summary: string }[])[0]?.summary).includes("\n")).toBe(
      false,
    );
  });

  it("still ends with the next-step instruction when the list is empty", async () => {
    const { tools } = boot({ listTraces: () => [] });
    const text = await named(tools, "understudy_list_recordings").execute({}, signal());
    expect(String(text).endsWith(LIST_NEXT_STEP)).toBe(true);
    expect(payload(text)["recordings"]).toEqual([]);
  });
});

describe("understudy_draft_tool", () => {
  it("returns the full trace and candidates when given only a recording id", async () => {
    const { tools } = boot();
    const draft = named(tools, "understudy_draft_tool");
    expect(draft.annotations?.readOnlyHint).toBe(false);
    const text = await draft.execute({ recordingId: "rec-1" }, signal());
    expect(String(text).endsWith(DRAFT_NEXT_STEP)).toBe(true);
    const body = payload(text);
    expect(body["trace"]).toEqual(sampleTrace());
    expect(body["candidateParameters"]).toEqual(candidates());
  });

  it("creates a draft from name and descriptions and never registers", async () => {
    const { tools, registered, drafts } = boot();
    const text = await named(tools, "understudy_draft_tool").execute(
      {
        recordingId: "rec-1",
        name: "escalate_billing",
        description: "Escalate a billing ticket.",
        parameterDescriptions: { priority: "Priority rank to apply." },
      },
      signal(),
    );
    const body = payload(text);
    expect(registered).toEqual([]);
    expect(drafts.get("draft-1")?.name).toBe("escalate_billing");
    expect((body["draft"] as ProcedureDraft).parameters[0]?.description).toBe(
      "Priority rank to apply.",
    );
    expect(body["registered"]).toBe(false);
  });

  it("fails fast on an unknown recording or a partial create call", async () => {
    const { tools } = boot();
    const draft = named(tools, "understudy_draft_tool");
    await expect(draft.execute({ recordingId: "missing" }, signal())).rejects.toThrow(
      /unknown recording: missing/,
    );
    await expect(
      draft.execute({ recordingId: "rec-1", name: "escalate_billing" }, signal()),
    ).rejects.toThrow(/name, description and parameter descriptions/);
  });
});

describe("understudy_publish_tool", () => {
  it("fails validation before prompting or registering", async () => {
    const { tools, drafts, ui, registered } = boot({
      validate: () => ["name exceeds 30 characters"],
    });
    drafts.set("draft-1", sampleDraft());
    await expect(
      named(tools, "understudy_publish_tool").execute({ draftId: "draft-1" }, signal()),
    ).rejects.toThrow(/name exceeds 30 characters/);
    expect(ui.prompts).toEqual([]);
    expect(registered).toEqual([]);
  });

  it("shows fully resolved dry-run values then registers only after approve", async () => {
    const { tools, drafts, ui, registered, audits } = boot();
    drafts.set("draft-1", sampleDraft());
    const publish = named(tools, "understudy_publish_tool");
    const held = publish.execute({ draftId: "draft-1" }, signal());
    await Promise.resolve();
    expect(registered).toEqual([]);
    expect(ui.prompts[0]?.dryRun.steps[0]?.resolvedPayload).toEqual({
      priority: "p1",
      ticketId: "tkt-99",
    });
    ui.resolve("approve");
    const body = payload(await held);
    expect(registered).toEqual(["draft-1"]);
    expect(body["status"]).toBe("published");
    expect(body["registrationId"]).toBe("reg-draft-1");
    expect(audits.some((entry) => entry.actor === "human" && entry.action === "approve")).toBe(
      true,
    );
  });

  it("does not register when the human rejects", async () => {
    const { tools, drafts, ui, registered } = boot();
    drafts.set("draft-1", sampleDraft());
    const held = named(tools, "understudy_publish_tool").execute({ draftId: "draft-1" }, signal());
    await Promise.resolve();
    ui.resolve("reject");
    expect(payload(await held)["status"]).toBe("rejected");
    expect(registered).toEqual([]);
  });

  it("on timeout tells the agent to ask the user to return to the tab", async () => {
    const { tools, drafts, clock, registered } = boot();
    drafts.set("draft-1", sampleDraft());
    const held = named(tools, "understudy_publish_tool").execute({ draftId: "draft-1" }, signal());
    await Promise.resolve();
    await clock.advance(APPROVAL_TIMEOUT_MS);
    const text = String(await held);
    expect(text.toLowerCase()).toContain("return to the tab");
    expect(text.toLowerCase()).not.toContain("focustab");
    expect(payload(text)["status"]).toBe("awaiting_approval");
    expect(registered).toEqual([]);
  });

  it("poll true returns awaiting_approval and a second call collects the outcome", async () => {
    const { tools, drafts, ui, registered } = boot();
    drafts.set("draft-1", sampleDraft());
    const publish = named(tools, "understudy_publish_tool");
    const first = payload(await publish.execute({ draftId: "draft-1", poll: true }, signal()));
    expect(first["status"]).toBe("awaiting_approval");
    expect((first["dryRun"] as { steps: { resolvedPayload: unknown }[] }).steps[0]?.resolvedPayload).toEqual({
      priority: "p1",
      ticketId: "tkt-99",
    });
    expect(registered).toEqual([]);
    ui.resolve("approve");
    await Promise.resolve();
    await Promise.resolve();
    const second = payload(await publish.execute({ draftId: "draft-1", poll: true }, signal()));
    expect(second["status"]).toBe("published");
    expect(second["registrationId"]).toBe("reg-draft-1");
    expect(registered).toEqual(["draft-1"]);
  });

  it("after timeout a later approve is collected on the next call", async () => {
    const { tools, drafts, ui, clock, registered } = boot();
    drafts.set("draft-1", sampleDraft());
    const publish = named(tools, "understudy_publish_tool");
    const held = publish.execute({ draftId: "draft-1" }, signal());
    await Promise.resolve();
    await clock.advance(APPROVAL_TIMEOUT_MS);
    expect(payload(await held)["status"]).toBe("awaiting_approval");
    ui.resolve("approve");
    await Promise.resolve();
    await Promise.resolve();
    const collected = payload(await publish.execute({ draftId: "draft-1", poll: true }, signal()));
    expect(collected["status"]).toBe("published");
    expect(registered).toEqual(["draft-1"]);
  });
});

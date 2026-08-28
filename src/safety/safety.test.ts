import { describe, expect, it } from "vitest";
import {
  APPROVAL_TIMEOUT_MESSAGE,
  APPROVAL_TIMEOUT_MS,
  assertRecordable,
  createApprovalGate,
  createAuditLog,
  type ApprovalDecision,
  type ApprovalPrompt,
} from "../safety";

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

const prompt: ApprovalPrompt = {
  draftId: "draft-1",
  name: "escalate_billing",
  description: "Escalate a billing ticket.",
  dryRun: {
    steps: [
      {
        index: 0,
        commandId: "set_priority",
        resolvedPayload: { priority: "p1", ticketId: "tkt-99" },
      },
    ],
  },
};

describe("assertRecordable", () => {
  it("throws when the command is sensitive", () => {
    expect(() => assertRecordable({ id: "bulk_delete", sensitive: true })).toThrow(
      /sensitive command excluded from recording: bulk_delete/,
    );
  });

  it("allows a non-sensitive command", () => {
    expect(() => assertRecordable({ id: "set_title", sensitive: false })).not.toThrow();
  });
});

describe("approval timeout constant", () => {
  it("is 45 seconds", () => {
    expect(APPROVAL_TIMEOUT_MS).toBe(45_000);
  });
});

describe("audit log", () => {
  it("keeps entries in memory when persist is omitted", async () => {
    const log = createAuditLog();
    await log.write({
      timestamp: "2026-08-27T00:00:00.000Z",
      actor: "agent",
      action: "publish",
      toolName: "understudy_publish_tool",
      argsDigest: "d1",
      outcome: "ok",
    });
    expect(log.list()).toHaveLength(1);
  });

  it("calls persist when injected", async () => {
    const saved: string[] = [];
    const log = createAuditLog((entry) => {
      saved.push(entry.action);
    });
    await log.write({
      timestamp: "2026-08-27T00:00:00.000Z",
      actor: "human",
      action: "approve",
      toolName: "escalate_billing",
      argsDigest: "d1",
      outcome: "registered",
    });
    expect(saved).toEqual(["approve"]);
  });
});

describe("approval gate", () => {
  it("holds until the human approves", async () => {
    const clock = createTestClock();
    const ui = deferredUi();
    const gate = createApprovalGate({ clock, ui });
    const held = gate.decide(prompt, false);
    await Promise.resolve();
    expect(ui.prompts).toHaveLength(1);
    let settled = false;
    void held.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    ui.resolve("approve");
    expect(await held).toEqual({ status: "approved" });
  });

  it("returns rejected without treating it as approved", async () => {
    const clock = createTestClock();
    const ui = deferredUi();
    const gate = createApprovalGate({ clock, ui });
    const held = gate.decide(prompt, false);
    await Promise.resolve();
    ui.resolve("reject");
    expect(await held).toEqual({ status: "rejected" });
  });

  it("times out with awaiting_approval and a return-to-tab message", async () => {
    const clock = createTestClock();
    const ui = deferredUi();
    const gate = createApprovalGate({ clock, ui });
    const held = gate.decide(prompt, false);
    await Promise.resolve();
    await clock.advance(APPROVAL_TIMEOUT_MS);
    expect(await held).toEqual({ status: "awaiting_approval", reason: "timeout" });
    expect(APPROVAL_TIMEOUT_MESSAGE.toLowerCase()).toContain("return to the tab");
    expect(APPROVAL_TIMEOUT_MESSAGE.toLowerCase()).not.toContain("focustab");
  });

  it("returns awaiting_approval immediately when poll is true", async () => {
    const clock = createTestClock();
    const ui = deferredUi();
    const gate = createApprovalGate({ clock, ui });
    const first = await gate.decide(prompt, true);
    expect(first).toEqual({ status: "awaiting_approval", reason: "poll" });
    expect(ui.prompts).toHaveLength(1);
    ui.resolve("approve");
    await Promise.resolve();
    expect(await gate.decide(prompt, true)).toEqual({ status: "approved" });
  });

  it("collects a late approval after timeout on a second call", async () => {
    const clock = createTestClock();
    const ui = deferredUi();
    const gate = createApprovalGate({ clock, ui });
    const held = gate.decide(prompt, false);
    await Promise.resolve();
    await clock.advance(APPROVAL_TIMEOUT_MS);
    expect(await held).toEqual({ status: "awaiting_approval", reason: "timeout" });
    ui.resolve("approve");
    await Promise.resolve();
    expect(await gate.decide(prompt, true)).toEqual({ status: "approved" });
  });
});

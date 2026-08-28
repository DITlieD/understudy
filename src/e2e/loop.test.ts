import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compile } from "../compiler";
import { bootApp, type AppHandle } from "../compose";
import { generalize } from "../generalizer";
import type { ProcedureDraft, PublishedProcedure, TraceStep } from "../model/types";
import { createMemoryDriver, createPersistence, PACK_VERSION, SOURCE_APP_VERSION } from "../persist";
import { badgeText } from "../ui";
import { installFakeModelContext } from "./fake-model-context";
import { mountShell } from "./shell";

const typedTag = {
  sourceControl: "filter-apply",
  sourceField: "tag",
  valueOrigin: "typed" as const,
};

const pickedPriority = {
  sourceControl: "priority-select",
  sourceField: "priority",
  valueOrigin: "picked" as const,
};

function signal() {
  return { signal: new AbortController().signal };
}

function compact(text: string) {
  return JSON.parse(text) as { ok: boolean; steps: { commandId: string }[] };
}

function asPublished(draft: ProcedureDraft): PublishedProcedure {
  return {
    ...draft,
    publishedAt: "2026-08-27T00:00:00.000Z",
    approvedBy: "human",
    registrationId: `reg-${draft.name}`,
    invocationCount: 0,
    successCount: 0,
    lastError: null,
  };
}

function extraStep(index: number, commandId: string, payload: Record<string, unknown>): TraceStep {
  return {
    index,
    commandId,
    payload,
    provenance: pickedPriority,
    resultSummary: "injected",
  };
}

describe("wired teach loop", () => {
  let app: AppHandle | undefined;
  let fake: ReturnType<typeof installFakeModelContext> | undefined;

  beforeEach(() => {
    mountShell();
    fake = installFakeModelContext();
  });

  afterEach(() => {
    app?.dispose();
    app = undefined;
    fake = undefined;
    Reflect.deleteProperty(document, "modelContext");
    document.body.replaceChildren();
  });

  it("records filter then mutate, publishes, and executes with different args", async () => {
    app = await bootApp({ persist: createPersistence(createMemoryDriver()) });
    const recordedId = "T-1041";
    const replayId = "T-1043";
    expect(app.state.tickets.find((ticket) => ticket.id === recordedId)?.priority).toBe("p2");
    expect(app.state.tickets.find((ticket) => ticket.id === replayId)?.priority).toBe("p2");

    app.startTeaching("bill_pri");
    app.run("filter_tickets", { tag: "billing" }, typedTag);
    app.run("set_ticket_priority", { ticketId: recordedId, priority: "p1" }, pickedPriority);
    const trace = await app.stopTeaching();
    expect(trace.steps.map((step) => step.commandId)).toEqual([
      "filter_tickets",
      "set_ticket_priority",
    ]);

    const draft = generalize(trace, app.catalogue);
    draft.name = "bill_pri";
    draft.description = "Set priority on a billing ticket.";
    const compiled = compile(draft, app.catalogue, { bus: app.bus });
    await app.registry.publish(asPublished({ ...draft, computedAnnotations: compiled.annotations }));

    expect(fake?.names()).toContain("bill_pri");
    const slot = fake?.tools.get("bill_pri");
    expect(slot).toBeTruthy();
    const raw = await slot!.tool.execute(
      { ticketId: replayId, priority: "p3", tag: "billing" },
      signal(),
    );
    expect(typeof raw).toBe("string");
    const summary = compact(String(raw));
    expect(summary.ok).toBe(true);
    expect(summary.steps.map((step) => step.commandId)).toEqual([
      "filter_tickets",
      "set_ticket_priority",
    ]);
    expect(app.state.tickets.find((ticket) => ticket.id === replayId)?.priority).toBe("p3");
    expect(app.state.tickets.find((ticket) => ticket.id === recordedId)?.priority).toBe("p1");
    expect(document.querySelector(`[data-ticket-id="${replayId}"] .us-provenance`)?.textContent).toBe(
      badgeText("bill_pri"),
    );
  });

  it("compiled execute cannot dispatch a command not in the recording", async () => {
    app = await bootApp({ persist: createPersistence(createMemoryDriver()) });
    app.startTeaching("only_pri");
    app.run("set_ticket_priority", { ticketId: "T-1041", priority: "p1" }, pickedPriority);
    const trace = await app.stopTeaching();
    const draft = generalize(trace, app.catalogue);
    draft.name = "only_pri";
    draft.description = "Set one ticket priority.";
    const compiled = compile(draft, app.catalogue, { bus: app.bus });
    draft.steps.push(extraStep(1, "set_ticket_status", { ticketId: "T-1041", status: "resolved" }));
    const seen: string[] = [];
    const stop = app.bus.subscribe((event) => {
      seen.push(event.commandId);
    });
    await compiled.execute({ ticketId: "T-1041", priority: "p4" }, signal());
    stop();
    expect(seen).toEqual(["set_ticket_priority"]);
    expect(app.state.tickets.find((ticket) => ticket.id === "T-1041")?.status).toBe("open");
  });

  it("surfaces unexplained selection when a mutation has no prior read", async () => {
    app = await bootApp({ persist: createPersistence(createMemoryDriver()) });
    app.startTeaching("bare_mut");
    app.run("set_ticket_priority", { ticketId: "T-1041", priority: "p1" }, pickedPriority);
    const trace = await app.stopTeaching();
    const draft = generalize(trace, app.catalogue);
    expect(draft.validationErrors.some((error) => /unexplained selection/i.test(error))).toBe(true);
    expect(document.querySelector("[data-flag=unexplained-selection]")?.textContent).toMatch(
      /unexplained selection/i,
    );
  });

  it("names the failing step, marks the library degraded, and re-teaches that step only", async () => {
    app = await bootApp({ persist: createPersistence(createMemoryDriver()) });
    app.startTeaching("fix_step");
    app.run("filter_tickets", { tag: "billing" }, typedTag);
    app.run("set_ticket_priority", { ticketId: "T-1041", priority: "p1" }, pickedPriority);
    const recorded = await app.stopTeaching();
    const draft = generalize(recorded, app.catalogue);
    draft.name = "fix_step";
    draft.description = "Filter then set priority.";
    const compiled = compile(draft, app.catalogue, { bus: app.bus });
    await app.registry.publish(asPublished({ ...draft, computedAnnotations: compiled.annotations }));

    const slot = fake?.tools.get("fix_step");
    const priorSignal = slot?.signal;
    const raw = await slot!.tool.execute(
      { tag: "billing", ticketId: "NOPE", priority: "p3" },
      signal(),
    );
    const failed = JSON.parse(String(raw)) as {
      ok: boolean;
      failingStep: number;
      error: string;
      steps: { commandId: string; ok: boolean }[];
    };
    expect(failed.ok).toBe(false);
    expect(failed.failingStep).toBe(1);
    expect(failed.error).toMatch(/step 1 set_ticket_priority failed: unknown ticket: NOPE/);
    expect(failed.steps[1]?.ok).toBe(false);
    expect(document.querySelector(".us-tool")?.classList.contains("is-degraded")).toBe(true);
    expect(document.querySelector("[data-action=reteach]")).not.toBeNull();

    document.querySelector("[data-action=reteach]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    app.run(
      "set_ticket_assignee",
      { ticketId: "T-1043", assignee: "sam" },
      {
        sourceControl: "assignee-select",
        sourceField: "assignee",
        valueOrigin: "picked",
      },
    );
    document.querySelector("[data-action=teach]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await expect
      .poll(
        () =>
          app!.registry.list().find((item) => item.name === "fix_step")?.steps[1]?.commandId ?? "",
      )
      .toBe("set_ticket_assignee");

    const repaired = app.registry.list().find((item) => item.name === "fix_step");
    expect(repaired?.steps.map((step) => step.commandId)).toEqual([
      "filter_tickets",
      "set_ticket_assignee",
    ]);
    expect(repaired?.steps[0]?.payload).toEqual({ tag: "billing" });
    expect(priorSignal?.aborted).toBe(true);
    expect(fake?.names()).toContain("fix_step");
    const next = fake?.tools.get("fix_step");
    expect(next?.signal).not.toBe(priorSignal);
    expect(next?.signal?.aborted).toBe(false);

    const replay = compact(
      String(await next!.tool.execute({ tag: "billing", ticketId: "T-1045", assignee: "sam" }, signal())),
    );
    expect(replay.ok).toBe(true);
    expect(replay.steps.map((step) => step.commandId)).toEqual([
      "filter_tickets",
      "set_ticket_assignee",
    ]);
    expect(app.state.tickets.find((ticket) => ticket.id === "T-1045")?.assignee).toBe("sam");
  });

  it("disable aborts the capability and enable re-registers from persist", async () => {
    app = await bootApp({ persist: createPersistence(createMemoryDriver()) });
    app.startTeaching("cap_off");
    app.run("set_ticket_priority", { ticketId: "T-1041", priority: "p1" }, pickedPriority);
    const recorded = await app.stopTeaching();
    const draft = generalize(recorded, app.catalogue);
    draft.name = "cap_off";
    draft.description = "Set one ticket priority.";
    const compiled = compile(draft, app.catalogue, { bus: app.bus });
    await app.registry.publish(asPublished({ ...draft, computedAnnotations: compiled.annotations }));
    expect(fake?.names()).toContain("cap_off");
    const prior = fake?.tools.get("cap_off")?.signal;

    document.querySelector("[data-action=enable]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(prior?.aborted).toBe(true);
    expect(fake?.names()).not.toContain("cap_off");
    expect(app.registry.list().map((item) => item.name)).toContain("cap_off");
    expect((await app.persist.published.list()).map((item) => item.name)).toContain("cap_off");

    await expect.poll(() => document.querySelector("[data-action=enable]")?.textContent ?? "").toMatch(/enable/i);
    document.querySelector("[data-action=enable]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await expect.poll(() => fake?.names() ?? []).toContain("cap_off");
    const restored = fake?.tools.get("cap_off");
    expect(restored?.signal).not.toBe(prior);
    expect(restored?.signal?.aborted).toBe(false);
    const replay = compact(
      String(await restored!.tool.execute({ ticketId: "T-1043", priority: "p3" }, signal())),
    );
    expect(replay.ok).toBe(true);
    expect(app.state.tickets.find((ticket) => ticket.id === "T-1043")?.priority).toBe("p3");
  });

  it("pack import refuses missing command ids and publishes a complete pack", async () => {
    app = await bootApp({ persist: createPersistence(createMemoryDriver()) });
    await expect(
      app.importPackJson({
        packVersion: PACK_VERSION,
        exportedAt: "2026-08-27T00:00:00.000Z",
        sourceAppVersion: SOURCE_APP_VERSION,
        requiredCommandIds: ["not_a_command"],
        procedures: [],
      }),
    ).rejects.toThrow(/import refused: missing commands: not_a_command/i);
    expect(app.registry.list()).toEqual([]);

    const procedure = asPublished({
      id: "pack-1",
      sourceTraceId: "tr-pack",
      name: "from_pack",
      description: "Imported procedure.",
      parameters: [],
      steps: [
        {
          index: 0,
          commandId: "filter_tickets",
          payload: { tag: "billing" },
          provenance: typedTag,
          resultSummary: "ok",
        },
      ],
      bindings: [],
      computedAnnotations: { readOnlyHint: true, untrustedContentHint: false },
      validationErrors: [],
    });
    const imported = await app.importPackJson({
      packVersion: PACK_VERSION,
      exportedAt: "2026-08-27T00:00:00.000Z",
      sourceAppVersion: SOURCE_APP_VERSION,
      requiredCommandIds: ["filter_tickets"],
      procedures: [procedure],
    });
    expect(imported.map((item) => item.name)).toEqual(["from_pack"]);
    expect(app.registry.list().map((item) => item.name)).toEqual(["from_pack"]);
    expect(fake?.names()).toContain("from_pack");
  });
});

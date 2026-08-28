import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootApp, type AppHandle } from "../compose";
import type { ModelContextTool } from "../webmcp/model-context";
import { createMemoryDriver, createPersistence } from "../persist";
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

describe("wired authoring and revoke", () => {
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

  it("lists, inspects, drafts without registering, then publish holds until Approve", async () => {
    app = await bootApp({ persist: createPersistence(createMemoryDriver()) });
    expect(fake?.names()).toEqual(
      expect.arrayContaining([
        "understudy_list_recordings",
        "understudy_draft_tool",
        "understudy_publish_tool",
      ]),
    );
    app.startTeaching("weekly");
    app.run("filter_tickets", { tag: "billing" }, typedTag);
    app.run("set_ticket_priority", { ticketId: "T-1041", priority: "p1" }, pickedPriority);
    const trace = await app.stopTeaching();

    const listBody = payload(await named(app.metaTools, "understudy_list_recordings").execute({}, signal()));
    const recordings = listBody["recordings"] as { id: string }[];
    expect(recordings.map((item) => item.id)).toContain(trace.id);

    const inspectText = await named(app.metaTools, "understudy_draft_tool").execute(
      { recordingId: trace.id },
      signal(),
    );
    const inspect = payload(inspectText);
    const candidates = inspect["candidateParameters"] as { key: string; description: string }[];
    expect(candidates.length).toBeGreaterThan(0);
    expect(fake?.names()).not.toContain("esc_p2");

    const descriptions: Record<string, string> = {};
    for (const candidate of candidates) {
      descriptions[candidate.key] = candidate.description || candidate.key;
    }
    const created = payload(
      await named(app.metaTools, "understudy_draft_tool").execute(
        {
          recordingId: trace.id,
          name: "esc_p2",
          description: "Escalate a billing ticket.",
          parameterDescriptions: descriptions,
        },
        signal(),
      ),
    );
    expect(created["registered"]).toBe(false);
    expect(fake?.names()).not.toContain("esc_p2");
    const draft = created["draft"] as { id: string };
    expect(draft.id).toBeTruthy();

    const held = named(app.metaTools, "understudy_publish_tool").execute({ draftId: draft.id }, signal());
    await Promise.resolve();
    expect(fake?.names()).not.toContain("esc_p2");
    const approve = document.querySelector("[data-action=approve]");
    expect(approve).not.toBeNull();
    approve?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const published = payload(await held);
    expect(published["status"]).toBe("published");
    expect(fake?.names()).toContain("esc_p2");
  });

  it("revoke aborts registration", async () => {
    app = await bootApp({ persist: createPersistence(createMemoryDriver()) });
    app.startTeaching("rev_me");
    app.run("set_ticket_priority", { ticketId: "T-1041", priority: "p1" }, pickedPriority);
    const trace = await app.stopTeaching();
    const inspect = payload(
      await named(app.metaTools, "understudy_draft_tool").execute({ recordingId: trace.id }, signal()),
    );
    const candidates = inspect["candidateParameters"] as { key: string; description: string }[];
    const descriptions: Record<string, string> = {};
    for (const candidate of candidates) {
      descriptions[candidate.key] = candidate.description || candidate.key;
    }
    const created = payload(
      await named(app.metaTools, "understudy_draft_tool").execute(
        {
          recordingId: trace.id,
          name: "rev_me",
          description: "Temporary taught tool.",
          parameterDescriptions: descriptions,
        },
        signal(),
      ),
    );
    const draft = created["draft"] as { id: string };
    const held = named(app.metaTools, "understudy_publish_tool").execute({ draftId: draft.id }, signal());
    await Promise.resolve();
    document.querySelector("[data-action=approve]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await held;
    const slot = fake?.tools.get("rev_me");
    expect(slot?.signal?.aborted).toBe(false);
    expect(fake?.names()).toContain("rev_me");
    await app.registry.revoke("rev_me");
    expect(slot?.signal?.aborted).toBe(true);
    expect(fake?.names()).not.toContain("rev_me");
    expect(app.registry.list().map((item) => item.name)).not.toContain("rev_me");
  });

  it("records a second demonstration and shows unexplained selection in review", async () => {
    app = await bootApp({ persist: createPersistence(createMemoryDriver()) });
    app.startTeaching("pair_me");
    app.run("filter_tickets", { tag: "billing" }, typedTag);
    app.run("set_ticket_priority", { ticketId: "T-1041", priority: "p1" }, pickedPriority);
    const first = await app.stopTeaching();
    expect(document.querySelector("[data-draft-id]")?.getAttribute("data-draft-id")).toBe(
      `draft:${first.id}`,
    );
    expect(document.querySelector("[data-flag=unexplained-selection]")?.textContent).toMatch(
      /unexplained selection/i,
    );

    document.querySelector("[data-action=teach]")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    app.run("filter_tickets", { tag: "access" }, typedTag);
    app.run("set_ticket_priority", { ticketId: "T-1043", priority: "p3" }, pickedPriority);
    document.querySelector("[data-action=teach]")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await expect
      .poll(() => document.querySelector("[data-draft-id]")?.getAttribute("data-draft-id") ?? "")
      .toMatch(new RegExp(`^draft:${first.id}:`));
    const review = document.querySelector(".us-review")?.textContent ?? "";
    expect(review).toMatch(/tag/);
    expect(review).toMatch(/ticketId/);
    expect(review).toMatch(/priority/);
  });
});

describe("degraded mode without modelContext", () => {
  let app: AppHandle | undefined;

  beforeEach(() => {
    mountShell();
    Reflect.deleteProperty(document, "modelContext");
  });

  afterEach(() => {
    app?.dispose();
    app = undefined;
    document.body.replaceChildren();
  });

  it("mounts the triage app and still records a demonstration", async () => {
    expect(document.modelContext).toBeUndefined();
    app = await bootApp({ persist: createPersistence(createMemoryDriver()) });
    expect(app.degraded).toBe(true);
    expect(document.getElementById("app-root")?.querySelector(".triage-app")).not.toBeNull();
    expect(document.getElementById("stub-controls")).toBeNull();
    expect(document.querySelector("[data-action=teach]")).not.toBeNull();
    expect(document.querySelector(".us-empty")).toBeNull();
    expect(document.getElementById("teaching-panel")?.childElementCount).toBe(0);
    expect(app.catalogue.list().map((command) => command.id)).toContain("filter_tickets");
    expect(app.catalogue.list().map((command) => command.id)).not.toContain("set_title");

    app.startTeaching("solo");
    app.run("filter_tickets", { tag: "billing" }, typedTag);
    const trace = await app.stopTeaching();
    expect(trace.steps).toHaveLength(1);
    expect(trace.steps[0]?.commandId).toBe("filter_tickets");
    expect(await app.persist.traces.load(trace.id)).toEqual(trace);
  });
});

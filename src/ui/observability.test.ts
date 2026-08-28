import { describe, expect, it, vi } from "vitest";
import type { TraceStep } from "../model/types";
import { mountBudgetMeter } from "./budget";
import { mountExecutionTrace } from "./trace";
import { mountTeachingPanel } from "./teaching";
import { mountToolLibrary } from "./library";
import { badgeText, mountProvenanceBadge } from "./provenance";
import type { ToolLibraryItem } from "./types";

function step(index: number, commandId: string): TraceStep {
  return {
    index,
    commandId,
    payload: {},
    provenance: {
      sourceControl: "test",
      sourceField: null,
      valueOrigin: "constant",
    },
    resultSummary: commandId,
  };
}

function tool(overrides: Partial<ToolLibraryItem> = {}): ToolLibraryItem {
  return {
    name: "escalate_sweep",
    author: "mara",
    createdAt: "2026-08-27T09:00:00.000Z",
    invocationCount: 10,
    successRate: 0.9,
    lastFailure: "step 3 timed out",
    readWrite: "write",
    enabled: true,
    ...overrides,
  };
}

describe("observability idle chrome", () => {
  it("renders nothing when teaching, library, and trace have no data", () => {
    const teaching = document.createElement("div");
    const library = document.createElement("div");
    const trace = document.createElement("div");
    mountTeachingPanel(teaching, {
      getTraceLive: () => ({ recording: false, label: "", steps: [] }),
    });
    mountToolLibrary(library, {
      listTools: () => [],
      revoke: () => {},
      setEnabled: () => {},
      reTeach: () => {},
    });
    mountExecutionTrace(trace, {
      getExecution: () => ({ toolName: null, steps: [], currentIndex: null }),
    });
    expect(teaching.childElementCount).toBe(0);
    expect(library.childElementCount).toBe(0);
    expect(trace.childElementCount).toBe(0);
    expect(teaching.querySelector(".us-empty")).toBeNull();
    expect(library.querySelector(".us-empty")).toBeNull();
    expect(trace.querySelector(".us-empty")).toBeNull();
  });

  it("shows error copy when a port throws", () => {
    const teaching = document.createElement("div");
    mountTeachingPanel(teaching, {
      getTraceLive: () => {
        throw new Error("recorder offline");
      },
    });
    expect(teaching.querySelector(".us-error")?.textContent).toMatch(/could not load the recording/i);
    expect(teaching.textContent).toMatch(/recorder offline/i);
  });
});

describe("teaching panel", () => {
  it("shows a recording indicator and accumulates live steps", () => {
    let live = {
      recording: true,
      label: "weekly sweep",
      steps: [] as TraceStep[],
    };
    let notify = () => {};
    const root = document.createElement("div");
    mountTeachingPanel(root, {
      getTraceLive: () => live,
      subscribe: (onChange) => {
        notify = onChange;
        return () => {};
      },
    });
    expect(root.querySelector(".us-rec")?.textContent).toBe("0");
    expect(root.querySelector(".us-empty")).toBeNull();
    live = {
      ...live,
      steps: [step(0, "set_title"), step(1, "set_priority")],
    };
    notify();
    expect(root.querySelector(".us-rec")?.textContent).toBe("2 · set_priority");
    const items = [...root.querySelectorAll(".us-step")].map((node) => node.textContent);
    expect(items).toEqual(["set_title", "set_priority"]);
  });
});

describe("tool library", () => {
  it("renders one taught tool with author, date, stats, and badges", () => {
    const root = document.createElement("div");
    mountToolLibrary(root, {
      listTools: () => [tool()],
      revoke: () => {},
      setEnabled: () => {},
      reTeach: () => {},
    });
    const card = root.querySelector(".us-tool");
    expect(card).not.toBeNull();
    expect(card?.classList.contains("is-degraded")).toBe(true);
    expect(card?.textContent).toMatch(/escalate_sweep/);
    expect(card?.textContent).toMatch(/mara/);
    expect(card?.textContent).toMatch(/2026-08-27/);
    expect(card?.textContent).toMatch(/10/);
    expect(card?.textContent).toMatch(/90%/);
    expect(card?.textContent).toMatch(/step 3 timed out/);
    expect(card?.textContent).toMatch(/degraded/i);
    expect(card?.querySelector(".us-rw")?.textContent).toBe("write");
    expect(card?.querySelector("[data-action=enable]")?.textContent).toMatch(/disable/i);
    expect(card?.querySelector("[data-action=reteach]")?.textContent).toMatch(/re-teach this step/i);
    expect(root.querySelector("[data-action=library]")?.textContent).toMatch(/1 tool/);
  });

  it("calls injected reTeach with the tool name on click", () => {
    const reTeach = vi.fn();
    const root = document.createElement("div");
    mountToolLibrary(root, {
      listTools: () => [tool()],
      revoke: () => {},
      setEnabled: () => {},
      reTeach,
    });
    const button = root.querySelector("[data-action=reteach]");
    expect(button).not.toBeNull();
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(reTeach).toHaveBeenCalledTimes(1);
    expect(reTeach).toHaveBeenCalledWith("escalate_sweep");
  });

  it("calls injected revoke with the tool name on click", () => {
    const revoke = vi.fn();
    const root = document.createElement("div");
    mountToolLibrary(root, {
      listTools: () => [tool()],
      revoke,
      setEnabled: () => {},
      reTeach: () => {},
    });
    const button = root.querySelector("[data-action=revoke]");
    expect(button).not.toBeNull();
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("escalate_sweep");
  });
});

describe("execution trace", () => {
  it("adds the highlight class on the current step", () => {
    const root = document.createElement("div");
    mountExecutionTrace(root, {
      getExecution: () => ({
        toolName: "escalate_sweep",
        steps: [step(0, "set_title"), step(1, "add_tag"), step(2, "set_assignee")],
        currentIndex: 1,
      }),
    });
    const current = root.querySelector(".is-highlighted");
    expect(current).not.toBeNull();
    expect(current?.textContent).toBe("add_tag");
    expect(root.querySelectorAll(".is-highlighted")).toHaveLength(1);
  });
});

describe("context budget meter", () => {
  it("warns when used characters approach the cap", () => {
    const root = document.createElement("div");
    mountBudgetMeter(root, {
      getBudget: () => ({ used: 860, cap: 1000 }),
    });
    expect(root.querySelector(".us-warn")?.textContent).toMatch(/nearly full/i);
    expect(root.textContent).toMatch(/860/);
    expect(root.textContent).toMatch(/1000/);
  });

  it("stays quiet when usage is well under the cap", () => {
    const root = document.createElement("div");
    mountBudgetMeter(root, {
      getBudget: () => ({ used: 120, cap: 1000 }),
    });
    expect(root.childElementCount).toBe(0);
    expect(root.querySelector(".us-warn")).toBeNull();
  });
});

describe("provenance badge", () => {
  it("exports persistent performed-by copy", () => {
    expect(badgeText("escalate_sweep")).toBe(
      "performed by agent via tool escalate_sweep",
    );
    const root = document.createElement("div");
    mountProvenanceBadge(root, "escalate_sweep");
    expect(root.querySelector(".us-provenance")?.textContent).toBe(
      "performed by agent via tool escalate_sweep",
    );
  });
});

import { describe, expect, it } from "vitest";
import { createBus, createCatalogue } from "../bus";
import { registerTriageCommands } from "../commands/triage";
import type { Provenance } from "../model/types";
import { createRecorder } from "../recorder";
import { createTriageState } from "../seed";

const pickedPriority: Provenance = {
  sourceControl: "priority-select",
  sourceField: "priority",
  valueOrigin: "picked",
};

const pickedAssignee: Provenance = {
  sourceControl: "assignee-select",
  sourceField: "assignee",
  valueOrigin: "picked",
};

const typedTag: Provenance = {
  sourceControl: "tags-input",
  sourceField: "tags",
  valueOrigin: "typed",
};

function boot() {
  const catalogue = createCatalogue();
  const state = createTriageState();
  registerTriageCommands(catalogue, state);
  catalogue.registerCommand({
    id: "bulk_delete",
    title: "Bulk delete",
    description: "Delete matching records.",
    mutates: true,
    sensitive: true,
    payloadSchema: { type: "object", properties: {} },
    handle: () => ({ ok: true, summary: "deleted", data: {} }),
  });
  const bus = createBus(catalogue);
  const recorder = createRecorder(bus, catalogue);
  return { bus, recorder };
}

describe("recorder", () => {
  it("records a 3-step demo with order, payloads, provenance, focus, and sensitive exclusion", () => {
    const { recorder, bus } = boot();
    const ticketId = "T-1041";
    recorder.startRecording({
      label: "weekly escalation sweep",
      authorLabel: "mara",
      focusContext: { recordId: "T-1041" },
    });
    recorder.recordCommand({
      commandId: "set_ticket_priority",
      payload: { ticketId, priority: "p2" },
      provenance: pickedPriority,
    });
    recorder.recordCommand({
      commandId: "set_ticket_assignee",
      payload: { ticketId, assignee: "mara" },
      provenance: pickedAssignee,
    });
    recorder.recordCommand({
      commandId: "set_ticket_tags",
      payload: { ticketId, tags: ["billing"] },
      provenance: typedTag,
    });
    bus.dispatch("bulk_delete", {});
    const trace = recorder.stopRecording();
    expect(trace.status).toBe("raw");
    expect(trace.label).toBe("weekly escalation sweep");
    expect(trace.authorLabel).toBe("mara");
    expect(trace.focusContext).toEqual({ recordId: "T-1041" });
    expect(trace.steps.map((step) => step.commandId)).toEqual([
      "set_ticket_priority",
      "set_ticket_assignee",
      "set_ticket_tags",
    ]);
    expect(trace.steps.map((step) => step.payload)).toEqual([
      { ticketId, priority: "p2" },
      { ticketId, assignee: "mara" },
      { ticketId, tags: ["billing"] },
    ]);
    expect(trace.steps.map((step) => step.provenance)).toEqual([
      pickedPriority,
      pickedAssignee,
      typedTag,
    ]);
    expect(trace.steps.map((step) => step.index)).toEqual([0, 1, 2]);
    expect(trace.steps.every((step) => step.resultSummary.length > 0)).toBe(true);
  });

  it("annotates provenance after a bus-only dispatch and updates focus context", () => {
    const { recorder, bus } = boot();
    recorder.startRecording({
      label: "annotate path",
      authorLabel: "mara",
      focusContext: { recordId: null },
    });
    recorder.setFocusContext({ recordId: "T-1041" });
    bus.dispatch("set_ticket_priority", { ticketId: "T-1041", priority: "p1" });
    recorder.annotate(0, pickedPriority);
    const trace = recorder.stopRecording();
    expect(trace.focusContext).toEqual({ recordId: "T-1041" });
    expect(trace.steps).toHaveLength(1);
    expect(trace.steps[0]?.commandId).toBe("set_ticket_priority");
    expect(trace.steps[0]?.payload).toEqual({ ticketId: "T-1041", priority: "p1" });
    expect(trace.steps[0]?.provenance).toEqual(pickedPriority);
  });
});

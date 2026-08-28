import { describe, expect, it } from "vitest";
import { createBus, createCatalogue } from "../bus";
import { registerTriageCommands } from "../commands/triage";
import { createRecorder } from "../recorder";
import { SEED_TICKETS, createTriageState } from "../seed";
import { wrapDispatch } from "./run";

describe("wrapDispatch", () => {
  it("tags provenance on the recorder", () => {
    const catalogue = createCatalogue();
    const state = createTriageState();
    registerTriageCommands(catalogue, state);
    const bus = createBus(catalogue);
    const recorder = createRecorder(bus, catalogue);
    recorder.startRecording({
      label: "assign priya",
      authorLabel: "mara",
      focusContext: { recordId: null },
    });
    const ticketId = SEED_TICKETS[0]?.id;
    wrapDispatch(recorder)("set_ticket_assignee", { ticketId, assignee: "priya" }, {
      sourceControl: "assignee-select",
      sourceField: "assignee",
      valueOrigin: "picked",
    });
    const trace = recorder.stopRecording();
    expect(trace.steps).toHaveLength(1);
    expect(trace.steps[0]?.commandId).toBe("set_ticket_assignee");
    expect(trace.steps[0]?.provenance).toEqual({
      sourceControl: "assignee-select",
      sourceField: "assignee",
      valueOrigin: "picked",
    });
    expect(trace.focusContext).toEqual({ recordId: null });
  });
});

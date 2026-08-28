import type { Bus } from "../bus";
import type { Provenance, Trace } from "../model/types";
import type { Persistence } from "../persist";
import type { Recorder } from "../recorder";
import type { TriageState } from "../seed";
import type { TraceLive } from "../ui";

export function createTeachingSession(deps: {
  bus: Bus;
  recorder: Recorder;
  persist: Persistence;
  traces: Map<string, Trace>;
  state: TriageState;
  live: TraceLive;
  authorLabel: string;
  ping: () => void;
  setRecording: (value: boolean) => void;
}) {
  const stopLive = deps.bus.subscribe((event) => {
    if (!deps.live.recording) {
      return;
    }
    deps.live.steps = [
      ...deps.live.steps,
      {
        index: deps.live.steps.length,
        commandId: event.commandId,
        payload: { ...event.payload },
        provenance: {
          sourceControl: event.commandId,
          sourceField: null,
          valueOrigin: "constant",
        } satisfies Provenance,
        resultSummary: event.result.summary,
      },
    ];
    deps.ping();
  });
  return {
    startTeaching(label: string) {
      const trimmed = label.trim();
      if (trimmed === "") {
        throw new Error("recording label required");
      }
      deps.setRecording(true);
      deps.live.recording = true;
      deps.live.label = trimmed;
      deps.live.steps = [];
      deps.recorder.startRecording({
        label: trimmed,
        authorLabel: deps.authorLabel,
        focusContext: { recordId: deps.state.focusedId },
      });
      deps.ping();
    },
    async stopTeaching() {
      deps.setRecording(false);
      const trace = deps.recorder.stopRecording();
      deps.live.recording = false;
      deps.live.steps = trace.steps;
      deps.traces.set(trace.id, trace);
      await deps.persist.traces.save(trace);
      deps.ping();
      return trace;
    },
    dispose() {
      stopLive();
    },
  };
}

import type { Bus, Catalogue } from "../bus";
import type {
  CommandResult,
  FocusContext,
  Provenance,
  Trace,
  TraceStep,
} from "../model/types";

export type StartRecordingInput = {
  label: string;
  authorLabel: string;
  focusContext: FocusContext;
};

export type CommandOrigin = {
  commandId: string;
  payload: Record<string, unknown>;
  provenance: Provenance;
};

export type Recorder = {
  startRecording: (input: StartRecordingInput) => void;
  stopRecording: () => Trace;
  recordCommand: (origin: CommandOrigin) => CommandResult;
  annotate: (stepIndex: number, provenance: Provenance) => void;
  setFocusContext: (focusContext: FocusContext) => void;
};

type CapturedStep = {
  commandId: string;
  payload: Record<string, unknown>;
  provenance: Provenance | null;
  resultSummary: string;
};

export function createRecorder(bus: Bus, catalogue: Catalogue): Recorder {
  let recording = false;
  let label = "";
  let authorLabel = "";
  let focusContext: FocusContext = { recordId: null };
  let createdAt = "";
  let id = "";
  let steps: CapturedStep[] = [];
  let pendingProvenance: Provenance | null = null;
  let unsubscribe: (() => void) | null = null;

  return {
    startRecording(input) {
      if (recording) {
        throw new Error("already recording");
      }
      recording = true;
      label = input.label;
      authorLabel = input.authorLabel;
      focusContext = { recordId: input.focusContext.recordId };
      createdAt = new Date().toISOString();
      id = crypto.randomUUID();
      steps = [];
      pendingProvenance = null;
      unsubscribe = bus.subscribe((event) => {
        const provenance = pendingProvenance;
        pendingProvenance = null;
        if (!recording) {
          return;
        }
        if (catalogue.get(event.commandId).sensitive) {
          return;
        }
        steps.push({
          commandId: event.commandId,
          payload: { ...event.payload },
          provenance,
          resultSummary: event.result.summary,
        });
      });
    },
    stopRecording() {
      if (!recording) {
        throw new Error("not recording");
      }
      const built: TraceStep[] = steps.map((step, index) => {
        if (step.provenance === null) {
          throw new Error("missing provenance");
        }
        return {
          index,
          commandId: step.commandId,
          payload: step.payload,
          provenance: step.provenance,
          resultSummary: step.resultSummary,
        };
      });
      recording = false;
      unsubscribe?.();
      unsubscribe = null;
      return {
        id,
        label,
        createdAt,
        authorLabel,
        focusContext: { recordId: focusContext.recordId },
        steps: built,
        status: "raw",
      };
    },
    recordCommand(origin) {
      pendingProvenance = {
        sourceControl: origin.provenance.sourceControl,
        sourceField: origin.provenance.sourceField,
        valueOrigin: origin.provenance.valueOrigin,
      };
      try {
        return bus.dispatch(origin.commandId, origin.payload);
      } finally {
        pendingProvenance = null;
      }
    },
    annotate(stepIndex, provenance) {
      const step = steps[stepIndex];
      if (!step) {
        throw new Error(`unknown step: ${stepIndex}`);
      }
      step.provenance = {
        sourceControl: provenance.sourceControl,
        sourceField: provenance.sourceField,
        valueOrigin: provenance.valueOrigin,
      };
    },
    setFocusContext(next) {
      focusContext = { recordId: next.recordId };
    },
  };
}

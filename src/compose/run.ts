import type { CommandResult, Provenance } from "../model/types";
import type { Recorder } from "../recorder";

export function wrapDispatch(recorder: Recorder) {
  return (
    commandId: string,
    payload: Record<string, unknown>,
    provenance: Provenance,
  ): CommandResult => {
    const result = recorder.recordCommand({
      commandId,
      payload,
      provenance,
    });
    if (commandId === "select_ticket" && result.ok) {
      const ticketId = payload["ticketId"];
      recorder.setFocusContext({
        recordId: typeof ticketId === "string" ? ticketId : null,
      });
    }
    return result;
  };
}

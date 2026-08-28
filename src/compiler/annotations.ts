import type { Catalogue } from "../bus";
import type { ComputedAnnotations, ProcedureDraft } from "../model/types";
import { commandReturnsUntrusted } from "./untrusted";

export function computeAnnotations(
  draft: ProcedureDraft,
  catalogue: Catalogue,
): ComputedAnnotations {
  let readOnlyHint = true;
  let untrustedContentHint = false;
  for (const item of draft.steps) {
    const command = catalogue.get(item.commandId);
    if (command.mutates) readOnlyHint = false;
    if (commandReturnsUntrusted(command, item.payload)) untrustedContentHint = true;
  }
  return { readOnlyHint, untrustedContentHint };
}

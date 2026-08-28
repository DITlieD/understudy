import type { CommandDefinition } from "../model/types";

export function assertRecordable(command: Pick<CommandDefinition, "id" | "sensitive">) {
  if (command.sensitive) {
    throw new Error(`sensitive command excluded from recording: ${command.id}`);
  }
}

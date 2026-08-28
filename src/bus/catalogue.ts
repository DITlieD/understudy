import type { CommandDefinition, RegisteredCommand } from "../model/types";

export type Catalogue = {
  registerCommand: (command: RegisteredCommand) => void;
  get: (id: string) => RegisteredCommand;
  list: () => CommandDefinition[];
};

export function createCatalogue(): Catalogue {
  const commands = new Map<string, RegisteredCommand>();
  return {
    registerCommand(command: RegisteredCommand) {
      if (commands.has(command.id)) {
        throw new Error(`duplicate command: ${command.id}`);
      }
      commands.set(command.id, command);
    },
    get(id: string) {
      const found = commands.get(id);
      if (!found) {
        throw new Error(`unknown command: ${id}`);
      }
      return found;
    },
    list() {
      return [...commands.values()].map((command) => ({
        id: command.id,
        title: command.title,
        description: command.description,
        payloadSchema: command.payloadSchema,
        mutates: command.mutates,
        sensitive: command.sensitive,
      }));
    },
  };
}

import type { CommandDefinition } from "../model/types";

export const UNTRUSTED_CONTENT_FIELDS = [
  "body",
  "ticketBody",
  "message",
  "content",
  "thread",
  "comments",
  "comment",
  "userContent",
] as const;

export const UNTRUSTED_CONTENT_RULE =
  "untrustedContentHint is true when any draft step's command has returnsUntrusted === true, or when that command's payload schema or recorded payload uses a known user-generated content field (body, ticketBody, message, content, thread, comments, comment, userContent). Catalogue entries may omit returnsUntrusted; the field list is the fallback.";

const UNTRUSTED = new Set<string>(UNTRUSTED_CONTENT_FIELDS);

export function commandReturnsUntrusted(
  command: CommandDefinition,
  payload: Record<string, unknown>,
): boolean {
  if (
    "returnsUntrusted" in command &&
    (command as CommandDefinition & { returnsUntrusted?: unknown }).returnsUntrusted === true
  ) {
    return true;
  }
  for (const key of Object.keys(command.payloadSchema.properties)) {
    if (UNTRUSTED.has(key)) return true;
  }
  for (const key of Object.keys(payload)) {
    if (UNTRUSTED.has(key)) return true;
  }
  return false;
}

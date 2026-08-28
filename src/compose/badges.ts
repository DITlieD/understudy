import { mountProvenanceBadge } from "../ui";

export function applyProvenanceBadges(badges: Map<string, string>) {
  for (const [ticketId, toolName] of badges) {
    const row = document.querySelector(`[data-ticket-id="${ticketId}"]`);
    if (!(row instanceof HTMLElement)) {
      continue;
    }
    const existing = row.querySelector(":scope > .us-agent-badge");
    const host = existing instanceof HTMLElement ? existing : document.createElement("span");
    if (host !== existing) {
      host.className = "us-agent-badge";
      row.append(host);
    }
    mountProvenanceBadge(host, toolName);
  }
}

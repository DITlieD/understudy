import "./styles.css";
import { text } from "./dom";

export function badgeText(toolName: string): string {
  return `performed by agent via tool ${toolName}`;
}

export function mountProvenanceBadge(host: HTMLElement, toolName: string): void {
  host.replaceChildren();
  host.append(text("span", "us-provenance", badgeText(toolName)));
}

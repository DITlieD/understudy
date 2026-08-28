import "./styles.css";
import { el, liveDraw, readSafe, showError, text } from "./dom";
import type { TeachingPorts } from "./types";

export function mountTeachingPanel(host: HTMLElement, ports: TeachingPorts): void {
  const draw = () => {
    host.replaceChildren();
    const result = readSafe(ports.getTraceLive);
    if (!result.ok) {
      const root = el("div", "us-teaching");
      host.append(root);
      showError(root, "Could not load the recording.", result.error);
      return;
    }
    const live = result.value;
    if (!live.recording) {
      return;
    }
    const root = el("div", "us-teaching is-live");
    root.tabIndex = 0;
    const last = live.steps.at(-1)?.commandId;
    const rec = text(
      "p",
      "us-rec",
      last ? `${live.steps.length} · ${last}` : String(live.steps.length),
    );
    rec.setAttribute("aria-live", "polite");
    root.append(rec);
    if (live.steps.length > 0) {
      const list = el("ol", "us-steps");
      for (const step of live.steps) {
        const item = el("li", "us-step");
        item.dataset.index = String(step.index);
        item.textContent = step.commandId;
        list.append(item);
      }
      root.append(list);
    }
    host.append(root);
  };
  liveDraw(draw, ports.subscribe);
}

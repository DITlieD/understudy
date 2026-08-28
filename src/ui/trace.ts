import "./styles.css";
import { el, liveDraw, readSafe, showError, text } from "./dom";
import type { ExecutionPorts } from "./types";

export function mountExecutionTrace(host: HTMLElement, ports: ExecutionPorts): void {
  const draw = () => {
    host.replaceChildren();
    const result = readSafe(ports.getExecution);
    if (!result.ok) {
      const root = el("div", "us-toast");
      host.append(root);
      showError(root, "Could not load the execution trace.", result.error);
      return;
    }
    const live = result.value;
    const running = live.toolName !== null && live.steps.length > 0;
    if (!running) {
      return;
    }
    const current = live.steps.find((step) => step.index === live.currentIndex);
    const root = el("div", "us-toast is-live");
    root.append(
      text(
        "p",
        "us-run",
        current ? `${live.toolName} · ${current.commandId}` : `Running ${live.toolName}`,
      ),
    );
    const list = el("ol", "us-steps");
    for (const step of live.steps) {
      const item = el("li", live.currentIndex === step.index ? "us-step is-highlighted" : "us-step");
      item.dataset.index = String(step.index);
      item.textContent = step.commandId;
      list.append(item);
    }
    root.append(list);
    host.append(root);
  };
  liveDraw(draw, ports.subscribe);
}

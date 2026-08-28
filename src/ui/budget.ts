import "./styles.css";
import { el, liveDraw, readSafe, showError, text } from "./dom";
import type { BudgetPorts } from "./types";

const WARN_RATIO = 0.8;

export function mountBudgetMeter(host: HTMLElement, ports: BudgetPorts): void {
  const draw = () => {
    host.replaceChildren();
    const result = readSafe(ports.getBudget);
    if (!result.ok) {
      const root = el("div", "us-budget");
      host.append(root);
      showError(root, "Could not load the context budget.", result.error);
      return;
    }
    const budget = result.value;
    if (budget.cap <= 0) {
      const root = el("div", "us-budget");
      host.append(root);
      showError(root, "Could not load the context budget.", "Budget cap is missing.");
      return;
    }
    const warn = budget.used / budget.cap >= WARN_RATIO;
    if (!warn) {
      return;
    }
    const root = el("div", "us-budget is-warning");
    const copy =
      budget.used >= budget.cap
        ? `Context budget is full. ${budget.used} / ${budget.cap}`
        : `Context budget is nearly full. ${budget.used} / ${budget.cap}`;
    root.append(text("p", "us-warn", copy));
    host.append(root);
  };
  liveDraw(draw, ports.subscribe);
}

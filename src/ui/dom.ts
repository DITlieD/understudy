export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  return node;
}

export function text(
  tag: keyof HTMLElementTagNameMap,
  className: string,
  value: string,
): HTMLElement {
  const node = el(tag, className);
  node.textContent = value;
  return node;
}

export function button(action: string, label: string): HTMLButtonElement {
  const node = el("button", "us-btn");
  node.type = "button";
  node.dataset.action = action;
  node.textContent = label;
  return node;
}

export function showError(root: HTMLElement, message: string, detail?: string): void {
  const copy = detail ? `${message} ${detail}` : message;
  root.append(text("p", "us-error", copy));
}

export function liveDraw(
  draw: () => void,
  subscribe?: (onChange: () => void) => () => void,
): void {
  draw();
  subscribe?.(draw);
}

export function readSafe<T>(
  read: () => T,
): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: read() };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error.";
    return { ok: false, error };
  }
}

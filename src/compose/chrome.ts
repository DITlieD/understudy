import "../ui/styles.css";

const DEFAULT_LABEL = "procedure";

export function mountTeachControls(
  host: HTMLElement,
  actions: {
    startTeaching: (label: string) => void;
    stopTeaching: () => Promise<unknown>;
    isRecording: () => boolean;
    subscribe: (onChange: () => void) => () => void;
  },
): () => void {
  const toggle = () => {
    if (actions.isRecording()) {
      void actions.stopTeaching();
      return;
    }
    actions.startTeaching(DEFAULT_LABEL);
  };
  const draw = () => {
    const recording = actions.isRecording();
    document.body.classList.toggle("is-recording", recording);
    host.replaceChildren();
    const start = document.createElement("button");
    start.type = "button";
    start.className = "us-btn us-teach";
    start.dataset.action = "teach";
    start.textContent = recording ? "Stop" : "Teach";
    start.addEventListener("click", toggle);
    host.append(start);
  };
  draw();
  const stop = actions.subscribe(draw);
  return () => {
    stop();
    document.body.classList.remove("is-recording");
  };
}

export function bindHotkeys(actions: {
  toggleTeach: () => void;
  stopIfRecording: () => void;
  exportPack: () => void;
}): () => void {
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      actions.stopIfRecording();
      return;
    }
    if (isTyping(event.target) || event.altKey) {
      return;
    }
    if ((event.key === "t" || event.key === "T") && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      actions.toggleTeach();
      return;
    }
    if ((event.key === "l" || event.key === "L") && !event.ctrlKey && !event.metaKey) {
      document.querySelector<HTMLElement>("[data-action=library]")?.click();
      return;
    }
    if ((event.key === "e" || event.key === "E") && event.shiftKey && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      actions.exportPack();
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}

export function requireId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`missing #${id}`);
  }
  return element;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

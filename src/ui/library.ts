import "./styles.css";
import { button, el, liveDraw, readSafe, showError } from "./dom";
import type { LibraryPorts, ToolLibraryItem } from "./types";

export function mountToolLibrary(host: HTMLElement, ports: LibraryPorts): void {
  let open = false;
  const draw = () => {
    host.replaceChildren();
    const result = readSafe(ports.listTools);
    if (!result.ok) {
      const root = el("div", "us-library");
      host.append(root);
      showError(root, "Could not load the tool library.", result.error);
      return;
    }
    if (result.value.length === 0) {
      open = false;
      return;
    }
    const root = el("div", "us-library");
    const count = button("library", toolCount(result.value.length));
    count.className = "us-btn us-lib-count";
    count.addEventListener("click", () => {
      open = !open;
      draw();
    });
    root.append(count);
    const pop = el("div", "us-lib-pop");
    if (!open) {
      pop.hidden = true;
    }
    for (const item of result.value) {
      pop.append(renderTool(item, ports));
    }
    if (ports.exportPack) {
      const overflow = el("div", "us-lib-overflow");
      const exported = button("export-pack", "Export");
      exported.addEventListener("click", () => {
        ports.exportPack?.();
      });
      const imported = button("import-pack", "Import");
      imported.addEventListener("click", () => {
        document.querySelector<HTMLInputElement>("[data-action=import-pack-file]")?.click();
      });
      overflow.append(exported, imported);
      pop.append(overflow);
    }
    root.append(pop);
    host.append(root);
  };
  liveDraw(draw, ports.subscribe);
}

function renderTool(item: ToolLibraryItem, ports: LibraryPorts): HTMLElement {
  const card = el("article", "us-tool");
  const head = el("div", "us-tool-head");
  const title = el("h3", "us-tool-name");
  title.textContent = item.name;
  const badge = el("span", "us-rw");
  badge.textContent = item.readWrite;
  head.append(title, badge);
  if (item.lastFailure) {
    card.classList.add("is-degraded");
    const mark = el("span", "us-degraded");
    mark.textContent = "Degraded";
    head.append(mark);
  }
  const meta = el("dl", "us-tool-meta");
  addFact(meta, "Author", item.author);
  addFact(meta, "Created", item.createdAt.slice(0, 10));
  addFact(meta, "Invocations", String(item.invocationCount));
  addFact(meta, "Success", `${Math.round(item.successRate * 100)}%`);
  addFact(meta, "Last failure", item.lastFailure ?? "No failure yet.");
  const actions = el("div", "us-tool-actions");
  const toggle = button("enable", item.enabled ? "Disable" : "Enable");
  toggle.addEventListener("click", () => {
    ports.setEnabled(item.name, !item.enabled);
  });
  const revoke = button("revoke", "Revoke");
  revoke.addEventListener("click", () => {
    ports.revoke(item.name);
  });
  actions.append(toggle, revoke);
  if (item.lastFailure) {
    const reteach = button("reteach", "Re-teach this step");
    reteach.addEventListener("click", () => {
      ports.reTeach(item.name);
    });
    actions.append(reteach);
  }
  card.append(head, meta, actions);
  return card;
}

function addFact(list: HTMLElement, label: string, value: string): void {
  const dt = el("dt");
  dt.textContent = label;
  const dd = el("dd");
  dd.textContent = value;
  list.append(dt, dd);
}

function toolCount(n: number): string {
  return n === 1 ? "1 tool" : `${n} tools`;
}

import { exportPack, importPack } from "../persist";
import type { Catalogue } from "../bus";
import type { Registry } from "../registry";
import type { PublishedProcedure, ToolPack } from "../model/types";

export function createPackIo(deps: {
  catalogue: Catalogue;
  registry: Registry;
  ping: () => void;
}) {
  return {
    exportPackJson(): ToolPack {
      return exportPack(deps.registry.list(), deps.catalogue);
    },
    async importPackJson(json: unknown): Promise<PublishedProcedure[]> {
      const procedures = importPack(json, deps.catalogue);
      for (const procedure of procedures) {
        await deps.registry.publish(procedure);
      }
      deps.ping();
      return procedures;
    },
  };
}

export function downloadPack(pack: ToolPack) {
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "understudy-pack.json";
  link.click();
  URL.revokeObjectURL(url);
}

export function mountPackControls(host: HTMLElement, io: ReturnType<typeof createPackIo>): () => void {
  host.replaceChildren();
  const file = document.createElement("input");
  file.type = "file";
  file.accept = "application/json";
  file.dataset.action = "import-pack-file";
  file.tabIndex = -1;
  file.addEventListener("change", async () => {
    const chosen = file.files?.[0];
    if (!chosen) {
      return;
    }
    await io.importPackJson(await chosen.text());
    file.value = "";
  });
  host.append(file);

  const onDragOver = (event: DragEvent) => {
    if (hasPackFile(event)) {
      event.preventDefault();
    }
  };
  const onDrop = async (event: DragEvent) => {
    const dropped = packFile(event);
    if (!dropped) {
      return;
    }
    event.preventDefault();
    await io.importPackJson(await dropped.text());
  };
  window.addEventListener("dragover", onDragOver);
  window.addEventListener("drop", onDrop);
  return () => {
    window.removeEventListener("dragover", onDragOver);
    window.removeEventListener("drop", onDrop);
  };
}

function hasPackFile(event: DragEvent): boolean {
  return [...(event.dataTransfer?.items ?? [])].some(
    (item) => item.kind === "file" && (item.type === "application/json" || item.type === ""),
  );
}

function packFile(event: DragEvent): File | null {
  const files = [...(event.dataTransfer?.files ?? [])];
  return files.find((item) => item.type === "application/json" || item.name.endsWith(".json")) ?? null;
}

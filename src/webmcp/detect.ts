import type { ModelContext } from "./model-context";

export function detectModelContext(doc: Document = document): ModelContext | null {
  const candidate = doc.modelContext;
  if (!candidate || typeof candidate.registerTool !== "function") {
    return null;
  }
  return candidate;
}

export function listenToolchange(ctx: ModelContext, onChange: () => void): () => void {
  ctx.addEventListener("toolchange", onChange);
  return () => {
    ctx.removeEventListener("toolchange", onChange);
  };
}

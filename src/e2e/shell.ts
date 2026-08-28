export function mountShell() {
  document.body.replaceChildren();
  document.body.innerHTML = `
    <div id="app-root"></div>
    <div id="us-chrome">
      <div id="teach-controls"></div>
      <div id="teaching-panel"></div>
      <div id="review-panel"></div>
      <div id="tool-library"></div>
      <div id="budget-meter"></div>
      <div id="execution-trace"></div>
      <div id="pack-controls"></div>
      <div id="approval-host"></div>
    </div>
  `;
}

export function requireFake() {
  const ctx = document.modelContext;
  if (!ctx) {
    throw new Error("expected document.modelContext");
  }
  return ctx;
}

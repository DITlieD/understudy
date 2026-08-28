import type { ProcedureDraft } from "../model/types";

export function mountReviewPanel(
  host: HTMLElement,
  ports: {
    getDraft: () => ProcedureDraft | null;
    isRecording: () => boolean;
    subscribe: (onChange: () => void) => () => void;
  },
) {
  const draw = () => {
    host.replaceChildren();
    const draft = ports.getDraft();
    if (!draft || ports.isRecording()) {
      return;
    }
    const root = document.createElement("section");
    root.className = "us-review";
    root.dataset.draftId = draft.id;
    const heading = document.createElement("h2");
    heading.className = "us-heading";
    heading.textContent = "Draft";
    const name = document.createElement("p");
    name.className = "us-draft-name";
    name.textContent = draft.name;
    root.append(heading, name);
    const params = document.createElement("ul");
    params.className = "us-params";
    for (const parameter of draft.parameters) {
      const item = document.createElement("li");
      item.textContent = parameter.key;
      params.append(item);
    }
    root.append(params);
    for (const error of draft.validationErrors) {
      const flag = document.createElement("p");
      flag.className = "us-flag";
      flag.dataset.flag = /unexplained selection/i.test(error)
        ? "unexplained-selection"
        : "validation";
      flag.textContent = error;
      root.append(flag);
    }
    host.append(root);
  };
  draw();
  ports.subscribe(draw);
}

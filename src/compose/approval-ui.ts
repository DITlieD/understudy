import type { ApprovalDecision, ApprovalUi } from "../safety";

export function createApprovalUi(host: HTMLElement): ApprovalUi {
  return {
    request(prompt) {
      return new Promise<ApprovalDecision>((resolve) => {
        host.replaceChildren();
        const root = document.createElement("section");
        root.className = "us-approval";
        const copy = document.createElement("p");
        copy.textContent = `Publish ${prompt.name}?`;
        const dry = document.createElement("pre");
        dry.textContent = JSON.stringify(prompt.dryRun, null, 2);
        const approve = document.createElement("button");
        approve.type = "button";
        approve.className = "us-btn";
        approve.dataset.action = "approve";
        approve.textContent = "Approve";
        const reject = document.createElement("button");
        reject.type = "button";
        reject.className = "us-btn";
        reject.dataset.action = "reject";
        reject.textContent = "Reject";
        const settle = (decision: ApprovalDecision) => {
          host.replaceChildren();
          resolve(decision);
        };
        approve.addEventListener("click", () => settle("approve"));
        reject.addEventListener("click", () => settle("reject"));
        const actions = document.createElement("div");
        actions.className = "us-approval-actions";
        actions.append(approve, reject);
        root.append(copy, dry, actions);
        host.append(root);
      });
    },
  };
}

import { APPROVAL_TIMEOUT_MS } from "./timeout";

export type Clock = {
  now: () => number;
  wait: (ms: number) => Promise<void>;
};

export type ApprovalDecision = "approve" | "reject";

export type DryRunStep = {
  index: number;
  commandId: string;
  resolvedPayload: Record<string, unknown>;
};

export type DryRunResult = {
  steps: DryRunStep[];
};

export type ApprovalPrompt = {
  draftId: string;
  name: string;
  description: string;
  dryRun: DryRunResult;
};

export type ApprovalUi = {
  request: (prompt: ApprovalPrompt) => Promise<ApprovalDecision>;
};

export type GateResult =
  | { status: "approved" }
  | { status: "rejected" }
  | { status: "awaiting_approval"; reason: "poll" | "timeout" };

type Session = {
  status: "awaiting_approval" | "approved" | "rejected";
  settled: Promise<ApprovalDecision>;
};

export type ApprovalGate = {
  decide: (prompt: ApprovalPrompt, poll: boolean) => Promise<GateResult>;
};

export function systemClock(): Clock {
  return {
    now: () => Date.now(),
    wait: (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
  };
}

export function createApprovalGate(deps: { clock: Clock; ui: ApprovalUi }): ApprovalGate {
  const sessions = new Map<string, Session>();
  return {
    async decide(prompt, poll) {
      let session = sessions.get(prompt.draftId);
      if (!session) {
        session = startSession(deps.ui, prompt);
        sessions.set(prompt.draftId, session);
      }
      if (session.status !== "awaiting_approval") {
        return { status: session.status };
      }
      if (poll) {
        return { status: "awaiting_approval", reason: "poll" };
      }
      await Promise.race([session.settled, deps.clock.wait(APPROVAL_TIMEOUT_MS)]);
      if (session.status !== "awaiting_approval") {
        return { status: session.status };
      }
      return { status: "awaiting_approval", reason: "timeout" };
    },
  };
}

function startSession(ui: ApprovalUi, prompt: ApprovalPrompt): Session {
  const session: Session = {
    status: "awaiting_approval",
    settled: Promise.resolve("reject"),
  };
  session.settled = ui.request(prompt).then((decision) => {
    session.status = decision === "approve" ? "approved" : "rejected";
    return decision;
  });
  return session;
}

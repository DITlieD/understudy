import type { AuditEntry, Parameter, ProcedureDraft, Trace } from "../model/types";
import type { ApprovalUi, Clock, DryRunResult } from "../safety";

export type RegisterResult = {
  registrationId: string;
};

export type MetaPorts = {
  listTraces: () => Trace[];
  getTrace: (id: string) => Trace | undefined;
  proposeCandidates: (trace: Trace) => Parameter[];
  createDraft: (input: {
    trace: Trace;
    name: string;
    description: string;
    parameterDescriptions: Record<string, string>;
  }) => ProcedureDraft;
  getDraft: (id: string) => ProcedureDraft | undefined;
  validate: (draft: ProcedureDraft) => string[];
  dryRun: (draft: ProcedureDraft) => DryRunResult;
  register: (draft: ProcedureDraft, approvedBy: string) => RegisterResult | Promise<RegisterResult>;
  clock: Clock;
  approvalUi: ApprovalUi;
  persistAudit?: (entry: AuditEntry) => void | Promise<void>;
};

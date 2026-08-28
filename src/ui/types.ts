import type { TraceStep } from "../model/types";

export type Unsubscribe = () => void;

export type LiveSubscribe = (onChange: () => void) => Unsubscribe;

export type TraceLive = {
  recording: boolean;
  label: string;
  steps: TraceStep[];
};

export type TeachingPorts = {
  getTraceLive: () => TraceLive;
  subscribe?: LiveSubscribe;
};

export type ToolLibraryItem = {
  name: string;
  author: string;
  createdAt: string;
  invocationCount: number;
  successRate: number;
  lastFailure: string | null;
  readWrite: "read" | "write";
  enabled: boolean;
};

export type LibraryPorts = {
  listTools: () => ToolLibraryItem[];
  revoke: (name: string) => void;
  setEnabled: (name: string, enabled: boolean) => void;
  reTeach: (name: string) => void;
  exportPack?: () => void;
  subscribe?: LiveSubscribe;
};

export type ExecutionLive = {
  toolName: string | null;
  steps: TraceStep[];
  currentIndex: number | null;
};

export type ExecutionPorts = {
  getExecution: () => ExecutionLive;
  subscribe?: LiveSubscribe;
};

export type Budget = {
  used: number;
  cap: number;
};

export type BudgetPorts = {
  getBudget: () => Budget;
  subscribe?: LiveSubscribe;
};

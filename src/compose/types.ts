import type { Bus, Catalogue } from "../bus";
import type { CommandResult, Provenance, PublishedProcedure, Trace, ToolPack } from "../model/types";
import type { Persistence } from "../persist";
import type { Recorder } from "../recorder";
import type { Registry } from "../registry";
import type { Clock } from "../safety";
import type { TriageState } from "../seed";
import type { ModelContextTool } from "../webmcp/model-context";

export type BootOptions = {
  persist?: Persistence;
  clock?: Clock;
  authorLabel?: string;
};

export type AppHandle = {
  bus: Bus;
  catalogue: Catalogue;
  recorder: Recorder;
  registry: Registry;
  persist: Persistence;
  state: TriageState;
  metaTools: ModelContextTool[];
  degraded: boolean;
  run: (
    commandId: string,
    payload: Record<string, unknown>,
    provenance: Provenance,
  ) => CommandResult;
  startTeaching: (label: string) => void;
  stopTeaching: () => Promise<Trace>;
  importPackJson: (json: unknown) => Promise<PublishedProcedure[]>;
  exportPackJson: () => ToolPack;
  dispose: () => void;
};

import { mountTriageApp } from "../app";
import { createBus, createCatalogue } from "../bus";
import { registerTriageCommands } from "../commands/triage";
import { createMetaTools } from "../meta";
import type { ProcedureDraft, Trace } from "../model/types";
import { createMemoryDriver, createPersistence } from "../persist";
import { createRecorder } from "../recorder";
import { createRegistry } from "../registry";
import { createTriageState } from "../seed";
import { systemClock } from "../safety";
import type { ExecutionLive, TraceLive } from "../ui";
import { detectModelContext } from "../webmcp";
import { createApprovalUi } from "./approval-ui";
import { createAuthoring } from "./authoring";
import { applyProvenanceBadges } from "./badges";
import { bindHotkeys, mountTeachControls, requireId } from "./chrome";
import { wrapExecuteFor } from "./execute-wrap";
import { createGuardedBus } from "./guard";
import { createMetaPorts } from "./meta-ports";
import { createNotifier } from "./notify";
import { mountObservability } from "./observe";
import { createPackIo, downloadPack, mountPackControls } from "./pack-io";
import { createPublishedHooks } from "./persist-hooks";
import { mountReviewPanel } from "./review-ui";
import { wrapDispatch } from "./run";
import { createTeachingSession } from "./session";
import type { AppHandle, BootOptions } from "./types";

export type { AppHandle, BootOptions };

export async function bootApp(options: BootOptions = {}): Promise<AppHandle> {
  const persist = options.persist ?? createPersistence(createMemoryDriver());
  const clock = options.clock ?? systemClock();
  const authorLabel = options.authorLabel ?? "human";
  const catalogue = createCatalogue();
  const state = createTriageState();
  registerTriageCommands(catalogue, state);
  let recording = false;
  const bus = createGuardedBus(createBus(catalogue), catalogue, () => recording);
  const recorder = createRecorder(bus, catalogue);
  const run = wrapDispatch(recorder);

  const traces = new Map<string, Trace>();
  const drafts = new Map<string, ProcedureDraft>();
  for (const item of await persist.traces.list()) traces.set(item.id, item);
  for (const item of await persist.drafts.list()) drafts.set(item.id, item);

  const live: TraceLive = { recording: false, label: "", steps: [] };
  const execution: ExecutionLive = { toolName: null, steps: [], currentIndex: null };
  const badges = new Map<string, string>();
  const ui = createNotifier();
  bus.subscribe(() => {
    queueMicrotask(() => applyProvenanceBadges(badges));
  });
  const teaching = createTeachingSession({
    bus,
    recorder,
    persist,
    traces,
    state,
    live,
    authorLabel,
    ping: ui.ping,
    setRecording: (value) => {
      recording = value;
    },
  });

  const publishedHooks = createPublishedHooks(persist);
  const registry = createRegistry({
    executeFor: wrapExecuteFor({
      catalogue,
      bus,
      persist,
      live: execution,
      badges,
      ping: ui.ping,
    }),
    persist: {
      loadPublished: publishedHooks.loadPublished,
      async savePublished(items) {
        await publishedHooks.savePublished(items);
        ui.ping();
      },
    },
  });
  await registry.restore();

  const authoring = createAuthoring({
    teaching,
    catalogue,
    bus,
    registry,
    ping: ui.ping,
  });

  const ports = createMetaPorts({
    catalogue,
    bus,
    traces,
    drafts,
    persist,
    registry,
    clock,
    approvalUi: createApprovalUi(requireId("approval-host")),
    ping: ui.ping,
  });
  const metaTools = createMetaTools(ports);
  const metaAbort = new AbortController();
  const ctx = detectModelContext();
  if (ctx) {
    for (const tool of metaTools) {
      await ctx.registerTool(tool, { signal: metaAbort.signal });
    }
  }
  const degraded = registry.snapshot().degraded;
  document.body.dataset.webmcp = degraded ? "degraded" : "live";

  mountTriageApp(requireId("app-root"), bus, run);
  const pack = createPackIo({ catalogue, registry, ping: ui.ping });
  const exportPackFile = () => {
    downloadPack(pack.exportPackJson());
  };
  const toggleTeach = () => {
    if (live.recording) {
      void authoring.stopTeaching();
      return;
    }
    authoring.startTeaching("procedure");
  };
  const stopTeach = mountTeachControls(requireId("teach-controls"), {
    startTeaching: authoring.startTeaching,
    stopTeaching: authoring.stopTeaching,
    isRecording: () => live.recording,
    subscribe: ui.subscribe,
  });
  mountObservability({
    teaching: requireId("teaching-panel"),
    library: requireId("tool-library"),
    budget: requireId("budget-meter"),
    trace: requireId("execution-trace"),
    registry,
    live,
    execution,
    subscribe: ui.subscribe,
    ping: ui.ping,
    startReTeach: authoring.startReTeach,
    exportPack: exportPackFile,
  });
  mountReviewPanel(requireId("review-panel"), {
    getDraft: authoring.getDraft,
    isRecording: () => live.recording,
    subscribe: ui.subscribe,
  });
  const stopPack = mountPackControls(requireId("pack-controls"), pack);
  const stopKeys = bindHotkeys({
    toggleTeach,
    stopIfRecording: () => {
      if (live.recording) {
        void authoring.stopTeaching();
      }
    },
    exportPack: exportPackFile,
  });

  return {
    bus,
    catalogue,
    recorder,
    registry,
    persist,
    state,
    metaTools,
    degraded,
    run,
    startTeaching: authoring.startTeaching,
    stopTeaching: authoring.stopTeaching,
    importPackJson: pack.importPackJson,
    exportPackJson: pack.exportPackJson,
    dispose() {
      stopTeach();
      stopPack();
      stopKeys();
      authoring.dispose();
      metaAbort.abort();
      registry.dispose();
    },
  };
}

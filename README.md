# Understudy

Show it once, and it becomes a tool your agent can use forever. Understudy is a support triage console. A person performs a multi-step task once in the live page. The page turns that demonstration into a parameterised WebMCP tool and registers it with `document.modelContext.registerTool()`. The human teaches. The agent writes the name and description. The human approves. The agent can then run that procedure in the same tab. The tool surface is not a list the developer shipped. It is a library the operators teach.

This is not a storefront. It is an ops teaching loop. There is no server and no OAuth dance per procedure. The tool reuses the page's own commands and the session that is already in the tab.

## Why this belongs on WebMCP

Would this be better as a server MCP? No. Understudy records a human operating the live UI inside their own authenticated session. It registers tools into that live tab. A server beside the browser cannot watch that demonstration or inherit that cookie. The product cannot exist anywhere but in the page.

Independent measurement, not ours: the WindTunnel benchmark ([nekuda-ai/WindTunnel](https://github.com/nekuda-ai/WindTunnel)) measured GPT-5.6 on native WebMCP solving 48/49 tasks at a median of $0.002 and 2,596 tokens, against $49.87 total and 29.3s median agent time for the same model driving the same sites via DOM and vision.

## What this checkout wires

`src/main.ts` opens IndexedDB and calls `bootApp`. Claims below are that boot path, not a future plan.

Shipped:

- A triage console on a typed command bus, seeded with 40 local tickets. Queue, filters, fields, assignment, tags, canned templates. No backend.
- Teach / Stop recording. `t` or `[data-action=teach]` starts; the control reads Stop while recording. Escape also stops. Steps are catalogue commands with payloads and provenance, not clicks or selectors. There is no Done control and no procedure-name field. Teach starts a recording labelled `procedure`.
- Single-trace generalizer (parameters, constants, step-output bindings). Entity ids default to parameters.
- Compiler: Chrome character budgets, auto-computed `readOnlyHint` / `untrustedContentHint`, command allowlist from the recording, abort between steps, compact JSON under 1.5K.
- Registry: `registerTool` plus one `AbortController` per taught tool. Restore from IndexedDB on load. Hard cap of 16 taught tools (the three meta-tools register on a separate controller). The registry listens for `toolchange` and re-reads the host list.
- Three meta-tools, registered when `document.modelContext` is present: `understudy_list_recordings`, `understudy_draft_tool`, `understudy_publish_tool`. Each list/inspect result ends with a next-step line. Drafts never register.
- Human approval on publish. The execute promise waits on in-page Approve / Reject. After 45 seconds it returns `awaiting_approval` and tells the agent to ask the user to return. `poll: true` returns immediately in that same shape.
- Observability: recording chip while teaching, execution toast with `.is-highlighted` on the current step, provenance badge `performed by agent via tool <name>` on mutated tickets, library count popover after the first publish (`l` opens it), context-budget warning only when nearly full. Idle chrome is Teach on the triage console. The Approve overlay mounts only while publish waits.
- Fail-and-repair re-teach. A failed run returns the failing step and the library stores `lastError`. **Re-teach this step** records one replacement command, then `registry.replace` aborts the old signal and registers the repaired tool.
- Pair traces. There is no Second demo button. A second Teach after the first Stop records another trace of the same label. That Stop calls `generalizeFromPair` and the Draft panel shows the paired draft. Meta-tools still generalize a single recording.
- Library Disable. Disable aborts that tool's `AbortController` (same host teardown as revoke). The published row stays in the library and in IndexedDB. Enable calls `registerTool` again. Reload via `restore()` re-enables every stored tool.
- Tool Pack export / import as versioned JSON. Ctrl+Shift+E downloads `understudy-pack.json`. Drop a `.json` pack onto the page to import. Import refuses packs whose command ids are missing from this catalogue. Import publishes at once (the human dropped the file). It does not re-open the approval prompt. After the first publish, Export / Import also sit in the library popover, not on an idle button row.
- IndexedDB stores traces, drafts, published procedures, and audit rows. Publish approve/reject writes audit entries.
- If WebMCP is absent, the console still runs for a human. `document.body.dataset.webmcp` is `degraded`. Tools do not register.

Not shipped, even where code exists under `src/`:

- A review panel that blocks on unexplained selection. The generalizer records those errors on the draft and the panel shows them. Compile / publish do not refuse them.
- Audit export in the chrome. `exportAuditJson` exists on persistence. No button mounts it.
- Sensitive catalogue entries. Recording refuses `sensitive: true` commands. Every live triage command is `sensitive: false`.
- A separate parameter editor on the draft panel. The panel lists inferred keys and flags. Agents set names and descriptions through `understudy_draft_tool`.
- The old four-command stub host (`set_title` and friends). `src/commands/stub.ts` is gone. Boot registers the triage catalogue only.

## Setup, run, test

Requires Node.js. From this directory:

```
npm install
npm run dev
npm test
```

`npm run dev` starts Vite. Open the origin it prints. The console is `/`. Feature detection is `/probe.html` (`public/probe.html`, also the file `probe.html` at the repo root).

`npm test` runs Vitest (`vitest run`).

`npm run build` typechecks and emits the console from `index.html`. Vite copies `public/probe.html` into `dist/probe.html`. Preview with `npm run preview`.

Source: https://github.com/DITlieD/understudy

Live URL (GitHub Pages): https://ditlied.github.io/understudy/

WebMCP check: Chrome with `chrome://flags/#enable-webmcp-testing`, or ChatGPT's in-app browser. Open `/probe.html` on the same origin. It reports whether `document.modelContext` is present, then tries a no-op `registerTool` named `understudy_probe`. If the object is absent, the triage UI still runs for a human.

## Command catalogue

The naive build is a click recorder. That is brittle, and it is not what WebMCP is for.

Every state change in this page goes through a typed command bus. Each command has a stable id, a JSON Schema payload, a human description, and a mutating or read-only flag. Recording captures that sequence. Replay dispatches the same commands the UI dispatches.

A taught tool can dispatch only commands that appeared in its recording. That allowlist is enforced in the compiler execute path. Query and filter commands are ordinary steps, because the selection criterion often is the procedure. Bindings come from a call-time parameter, an earlier step's output, or a frozen constant.

Live catalogue (boot registers these, nothing else):

- Read: `filter_tickets`, `get_ticket`, `list_templates`, `list_assignees`
- Write: `select_ticket`, `set_ticket_priority`, `set_ticket_status`, `set_ticket_assignee`, `set_ticket_tags`, `apply_template`

The triage UI dispatches those through visible controls, except `get_ticket`, which is in the catalogue for replay if a recording includes it.

## Safety model

A user-authored tool an agent can call is a footgun. What boot actually enforces:

1. **Allowlist by construction.** Execute may dispatch only command ids from the recording. Unknown ids throw.
2. **Human approval on publish.** `understudy_publish_tool` holds until Approve or Reject, or returns `awaiting_approval` on timeout / poll. Revoke is a human act in the library. It is not an agent tool.
3. **Auto-computed annotations.** `readOnlyHint` is true only if no step mutates. `untrustedContentHint` is true if a step's command or payload uses known user-generated fields (ticket bodies and similar). These are not hand-set. The spec has no `destructiveHint`. Destructiveness lives in the description and in the gate.
4. **Provenance.** Agent mutations get an on-row badge naming the tool. Publish decisions are appended to the audit store.
5. **Revocation.** One click aborts that tool's `AbortController`. `toolchange` fires. The capability is gone mid-session.

The dry-run shown at approval binds sample values. It does not dispatch against live tickets.

## Spec gaps this build works around

Verified against the shipped WebMCP surface. We do not pretend these primitives exist.

- **No elicitation primitive.** Approval is in-page UI. The execute callback holds a promise, or the agent polls with `poll: true`.
- **No transient user activation** on tool calls. No file pickers, `requestPermission`, popups, clipboard writes, or `PaymentRequest` from inside a tool. Pack import is a human drop of a `.json` file, or the library popover file picker after a tool exists. It is not a tool call.
- **No progress reporting and no streaming.** A taught procedure returns one compact result. The compiler projects and truncates to 1.5K.
- **No `unregisterTool`.** Register with `registerTool`. Revoke only by aborting the signal passed at register time. `navigator.modelContext`, `provideContext()`, and `clearContext()` are removed. This repo registers on `document.modelContext` only.
- **No `focusTab()`.** If the tab is backgrounded, the human may never see Approve. After 45 seconds the gate times out and tells the agent to ask the user to return.

Also absent from the spec, so we do not design around them as if they shipped: agent identity on `execute` (second argument is only `{ signal }`), `outputSchema`, `destructiveHint`.

Chrome character budgets (name 30, parameter description 150, tool description 500) are enforced at compile. Over-budget drafts fail `understudy_publish_tool` validation.

## Known limitations

- Procedures are linear step sequences with parameters. No loops, no branching, no expressions. Conditionals are the agent's job: compose more than one taught tool.
- A judgement the operator made only in their head, with no catalogued command, cannot be captured.
- Record references must default to parameters, never constants. Guessing the other way produces a tool that silently operates on the wrong record forever. Pairing two traces still exists if you Teach twice. There is no Second demo control. Meta-tools still generalize one trace.
- Tools are tab-scoped and ephemeral. Persistence in this checkout is IndexedDB in this origin, plus Tool Pack files. No accounts, no multi-user sync.
- Tool-surface bloat degrades agent selection. The registry refuses a 17th taught tool. Disable frees that host slot until Enable, or until the next load re-registers every stored tool.
- The console has no conversation thread, no SLA engine, and no related-item graph. That trim is deliberate.
- Live URL: https://ditlied.github.io/understudy/

## Differentiator

Nearby work emits artefacts consumed elsewhere. Understudy grows the page's live tool surface via `registerTool`. The plan's survey found no existing WebMCP implementation of programming-by-demonstration.

- **Schrute** records browser interactions and emits reusable skills as MCP tools. Those tools run outside the page, on an external MCP server.
- **Narada** imitation learning is a Chrome extension that emits workflows for a proprietary agent runtime. Not page-authored WebMCP tools.
- **Cursor learn mode** (and Lotus MCP) teach a workflow and emit skill files or MCP tools for a coding-agent harness. They do not register runtime tools on the open tab.
- **webMCP-Legit-exploration** uses WebMCP plus Git-like state: agent branches, phantom events that preview writes before commit, a large fixed tool list. It solves safe agent writes on a surface the developer shipped. Understudy changes that surface. Preview-before-commit is already their work. It is not our novelty.

The one-sentence distinction: everyone else records a demonstration to produce an artefact consumed elsewhere. We record a demonstration to grow the page's own live tool surface.

## License

MIT. See `LICENSE`.

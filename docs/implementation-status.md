# Implementation status

ElseWhen 0.1.0 is a working Windows desktop development release, built from the supplied [product brief](build-brief.txt) and visual references. It includes a designer, deterministic player, optional OpenAI interpreter, original playable sample, light/dark themes, and Windows distribution artifacts. The main acceptance journeys are implemented and tested. The longer brief also describes refinements that remain; they are explicitly listed below.

## Delivered

| Area         | Implemented behavior                                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop      | Native menus/dialogs, application icon, source projects, recent files, package entry, preferences, sandboxed renderer and narrow validated IPC                                                                                                          |
| Authoring    | Locations, objects, containment, characters/dialogue, connections/reverse pairs/shared doors, typed variables, custom actions, inherited object types, properties, descriptions, references and draft validation                                        |
| History      | Coalesced editor undo/redo, separate session undo/redo, immutable playtest snapshots, restart with source changes                                                                                                                                       |
| Visual rules | Check/Handle/After/Event phases, bindings, recursive All/Any/Not conditions, typed comparisons, ordered effects, refusal, scheduling, seeded random branches, endings                                                                                   |
| Map          | Perspective/orthographic views, orbit/pan/zoom, selection, Ctrl/Cmd additive selection, framing, translation gizmo, coordinate editing, snapping, connection creation, context creation, pinned auto-layout, region filtering, 2D and list alternatives |
| Player       | Authored transcript, command history, inventory, discovered map with unknown destinations, exact-exit travel, search/export/font size, conventional commands, clarification, queues, save/restore and endings                                           |
| Debugging    | Actual canonical intent, rules/effects, state diffs, public parser context, latency/usage, undoable designer controls, scenario execution                                                                                                               |
| Persistence  | Schema validation, deterministic compile/export, atomic source writes, external-change checks, rolling backups, locks/read-only mode, saved-project and never-saved draft recovery, exact-revision game saves                                           |
| OpenAI       | Official Responses API adapter, strict structured output, semantic validation, bounded public context, key/model settings, protected credential storage, cancellation/stale-result protection, opt-in evaluation                                        |
| Sample       | The Folded Horizon: 7 locations, 10 objects, 11 directed connections, Archivist dialogue, 3 puzzle/event rules, custom Speak action, and a complete 18-command solution                                                                                 |

## Verification on the development host

Host: Windows 10 build 19045, x64, Intel Core i7-5820K at 3.30 GHz, 64 GiB memory. Shell tooling used Node 24.19.0; elevated desktop/package verification used Node 22.23.3. Electron 44.7.2 remains sandboxed.

| Check                          | Result                                                                                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency installation        | Pinned dependencies and pnpm lockfile installed; Electron runtime downloaded                                                                                                                                                 |
| `pnpm typecheck`               | Passed                                                                                                                                                                                                                       |
| `pnpm lint`                    | Passed                                                                                                                                                                                                                       |
| `pnpm test`                    | 34 deterministic tests passed                                                                                                                                                                                                |
| Actual Electron workflow suite | 7 workflows passed, including rotation/selection/themes/2D, GUI creation and connections, container interaction, edited rule tracing, full sample, package save/restore, scenarios/debug snapshots, and close/draft recovery |
| `pnpm validate:examples`       | Passed: 18 commands, turn 17, ending `homeward`                                                                                                                                                                              |
| `pnpm eval:parser`             | Confirmed opt-in/no-network behavior; no paid evaluation run                                                                                                                                                                 |
| `pnpm build`                   | Main process, isolated preload and renderer built successfully                                                                                                                                                               |
| `pnpm package:win`             | Windows x64 NSIS installer and portable executable built successfully, unsigned; executable metadata and icon applied                                                                                                        |

The Electron tests use isolated temporary application data and mock only native file-dialog path selection. They interact with the real renderer, IPC, compiler, parser, engine, and files. API transport tests mock OpenAI independently. No live model accuracy or provider-account connectivity claim is made.

The final unpacked **packaged executable** was also launched directly with an exported `.elsegame` argument. It reported `isPackaged: true`, loaded from `app.asar`, and completed all 18 walkthrough commands to the ending without renderer errors. This checks packaged startup and game-file argument handling, independently of the source runner. Reproduce with `node node_modules/tsx/dist/cli.mjs scripts/smoke-package.ts` after packaging.

## Scale fixture

The fixture has 1,000 locations, 3,000 connections, 5,000 objects and 1,000 rules. Engine measurements in one host run:

| Operation         |     Time |
| ----------------- | -------: |
| Compile           | 529.5 ms |
| Start and observe | 129.4 ms |
| Wait transaction  | 142.1 ms |
| Player projection |  10.5 ms |

The initial desktop profile exposed excessive draw calls: 83 ms median frame interval, 884 ms sampled 95th percentile, and 3,221 ms to switch to 2D. Large maps now use instanced nodes/arrows, batched line geometry, and selected-node labels; the SVG fallback reduces dense labels too. On the same host, a follow-up profile measured 1,544 ms opening the project, 17 ms median and 95th-percentile frame intervals over a short 20-frame sample, 394 ms switching to 2D, and 498 ms searching for an object. These are local observations, not hardware-independent performance promises or a sustained GPU benchmark.

Explorer collections are paged in groups of 100, validation is debounced, and scope lookups use entity indexes. Rule filtering and some containment/observation operations still scan collections. Further profiling should focus on long play sessions and editing large worlds with complex conditional logic.

A second instrumented run, with screenshot capture and renderer-error collection, also passed: 1,627 ms opening, 17/33 ms median/95th-percentile frame interval, 567 ms switching to 2D, and 834 ms search. The Windows package build was running concurrently during this measurement; the variation reinforces the limited scope of these samples.

Reproduce with `pnpm stress --write`, then `node node_modules/tsx/dist/cli.mjs scripts/profile-desktop.ts` after building. The profile launches real Electron with a temporary profile and writes a stress-map screenshot under `test-results`. Close any prior profiling instance before reusing its generated source fixture.

## Remaining refinements and verification

- The map's additive selection supports inspection/framing; translation acts on the active node. Group translation, a configurable arrangement plane, richer connection routing, and a full layout-constraint system remain. Dense maps deliberately simplify labels and concealed-edge styling.
- Dialogue currently supports one conditional response per topic plus effects, greeting, and fallback. A dedicated multi-variant conversation preview and first-conversation effect editor remain. Authors can express extra behavior through action/event rules.
- The debugger exposes actual runtime parsing, and scenarios run independently. A standalone parser playground, per-rule hypothetical-state test panel, arbitrary state assertions in the scenario editor, and exportable canonical replay journals remain.
- Undo/redo restores runtime results without model calls. Persisted saves start a fresh undo history; there is no saved history-branch viewer. Scenario edits need **Save tests** before leaving their editor.
- Source validation catches core references, placement/cycles, type chains, rule/event constraints and likely unreachable locations. It is not a complete static proof of puzzle solvability. Validation opens the owning editor, rather than focusing every nested field automatically.
- Forms, controls, modals, focus indicators, reduced-motion styles and map lists are present. Full screen-reader testing, high-DPI/device coverage, and formal contrast auditing remain.
- macOS/Linux configurations have not been built or run. Windows installer generation is verified; a full install/uninstall and file-association registration cycle has not been performed on this machine. Signing and public release publication are not performed.
- Live OpenAI connection/evaluation awaits the owner's API configuration and opt-in billable run. Fixture and mocked-transport coverage is not a substitute for that verification.

## Artifacts and source

`release/ElseWhen Setup 0.1.0.exe` is the installer; `release/ElseWhen 0.1.0.exe` is the portable build; `release/win-unpacked/ElseWhen.exe` is the unpacked application. Generated binaries, dependencies, test results and private settings are excluded from Git.

The repository contains all source, tests, schemas, the complete sample, icon source/generator, the original brief, and documentation. Use `pnpm dev` for development or the Windows artifacts to run without Node/pnpm.

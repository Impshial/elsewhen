# Implementation status

ElseWhen 0.2.0 replaces the prototype interpreter with a deterministic local IF engine. The [rewrite brief](local-engine-brief.txt) is the current specification; the [original brief](history/build-brief-v1.txt) is historical. The initial application was preserved and pushed as commit d4a7853 before this rewrite.

## Delivered

- Version-two domain, compiled game and save formats, an explicit standard-action registry, vocabulary and grammar catalogs, bounded lexer/grammar matching, public-scope noun resolution, typed role validation, structured questions and discourse.
- Directions, known destinations and shared doors; sequences, frozen lists, quantities/exclusions, pronouns, repeat selectors and per-action undo/redo.
- Capability-based object behavior, containment/support, light, actor occupancy, NPC possession and typed properties, reversible consumption, pure requirements, replacement outcomes, After/Response rules, subordinate actions and deterministic per-turn event instances.
- Visual vocabulary chips, command shapes, role constraints, verb synonyms, property/event/ending registries, contextual behavior controls and isolated scenario assertions. The existing 2D/3D world map and dark/light themes remain.
- A complete native Game Player window backed by the same host session. Transfers preserve pending questions, input/history and presentation; the native renderer has reduced IPC privileges and receives no designer snapshot.
- Copy-based migration, recoverable review records, exact-revision portable saves and atomic authoring storage. Settings migration retains recent projects/unrelated preferences and removes only the retired application credential file.
- Two ordinary-data examples: The Folded Horizon and The Courtyard. The latter includes three rooms, a drawer/key/photo puzzle, shared door, lamp, transparent case, caretaker and custom bell interaction.
- Production AI transport, SDK, key/model UI, provider IPC, environment-key handling and evaluation script removed. No API key is needed.

## Verification

Host: Windows 10 build 19045, x64, Intel Core i7-5820K, 64 GiB memory. Electron renderer sandboxing and context isolation remain enabled.

Type checking, ESLint and the production Electron/Vite build pass. All 88 deterministic unit/integration tests pass, as do both generated example walkthroughs. The Folded Horizon completes 18 commands at turn 17 with ending homeward; The Courtyard completes nine commands at turn nine with Bell rung true.

Eleven real Electron journeys cover themes/maps, blank-world creation and connections, source save/reopen/recovery, container behavior, visual rule editing, export/player save and restore, scenario/debug snapshots, GUI drawer/custom-verb authoring, vocabulary and typed property controls, settings migration and detached-player lifecycle. The enhanced native journey also tests saving a question, restore without execution, undo/redo, repeated transfer, restricted IPC, off-screen saved bounds and cancellation of application quit.

The packaged verification runner uses a blocked proxy and DNS resolution from launch, aborts HTTP(S) renderer requests, and supplies an empty API-key variable. It can run the same entire workflow suite against the actual Windows executable:

```powershell
$env:ELSEWHEN_E2E_PACKAGED = '1'
node node_modules/@playwright/test/cli.js test
Remove-Item Env:ELSEWHEN_E2E_PACKAGED
node node_modules/tsx/dist/cli.mjs scripts/smoke-package.ts
```

On 2026-10-16, all eleven journeys passed against the final packaged Windows executable with those network restrictions and zero HTTP(S) requests observed. The separate smoke script also passed command-line .elsegame loading and all 18 walkthrough commands. The process reported version 0.2.0, isPackaged true and an app.asar application path. Both the NSIS installer and portable executable were generated successfully.

The workflow tests exercise the real renderer, host, compiler, parser, engine and files. Native file dialogs are substituted only to choose temporary test paths; close-dialog responses are substituted to test cancellation. DNS/proxy blocking and HTTP(S) interception are per application, not a machine-wide firewall change. Production source, built output and the lockfile were also checked for retired provider imports and endpoints.

## Scale and practical limits

The 1,000-location / 3,000-connection / 5,000-object / 1,000-rule fixture completed on this host: compile 605 ms, start/observe 292 ms, Wait transaction 533 ms and player projection 16 ms. These are one local run, not sustained performance guarantees. The engine still scans some rule/containment collections. Large maps retain the existing batched rendering and paged explorer.

The parser supports explicit English command forms, not unrestricted natural language. Limits and turn semantics are documented in the [command reference](command-reference.md) and [engine semantics](engine-semantics.md). General interaction verbs require authored behavior; combat, multilingual grammar, voice, fluid/weight simulation and automatic long-distance routing are outside this rewrite.

Version-one source upgrades require review and Save As; version-one progress saves require the original application. Portable saves deliberately start a new undo/redo baseline. Scenario edits require Save tests. Static validation is not a proof that a puzzle is solvable.

The Windows installer and portable executable are unsigned development builds. Installation/uninstallation and OS file-association registration have not been exercised. macOS/Linux builds, physical multi-monitor disconnects, full screen-reader access and high-DPI device coverage remain unverified. Window restoration clamps saved bounds to the current display work area.

## Artifacts

Windows outputs are release/ElseWhen Setup 0.2.0.exe, release/ElseWhen 0.2.0.exe and release/win-unpacked/ElseWhen.exe. Generated binaries, dependencies, profiles and test results stay outside Git. The user's existing ElseWhen.zip archive remains untouched.

# ElseWhen

A Windows-first desktop studio for creating and playing interactive fiction. Build a world out of caves, dreams, dimensions, or moments in time. Connect its places, write its rules, and step into the story.

ElseWhen uses an authoritative local game engine. OpenAI can interpret a player's language, but cannot invent entities, change state, or decide a puzzle's outcome. Conventional commands work offline.

![ElseWhen's dark world-map designer](docs/images/world-map-dark.png)

[Light theme](docs/images/world-map-light.png) · [Playtest debugger](docs/images/rule-playtest.png)

## Run

Use Node.js 22.12+ (24 LTS recommended) and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

On the welcome screen, choose **Create a world** or **Explore the sample**. The included _The Folded Horizon_ is a complete short adventure. Use the sun/moon button to switch themes; the preference persists.

The source project is `project.elsewhen.json`. Save a source project to continue authoring; export an `.elsegame` to distribute a playable game. Players use ElseWhen's **Open a game** command. The exported package contains everything needed for offline play, but does not contain the ElseWhen executable.

## Development commands

| Command                   | Purpose                                                                    |
| ------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev`                | Launch Electron with the Vite development renderer                         |
| `pnpm typecheck`          | Check the shared types and application                                     |
| `pnpm lint`               | Run ESLint                                                                 |
| `pnpm test`               | Run deterministic engine, parser, compiler, persistence, and session tests |
| `pnpm test:e2e`           | Build and run actual Electron workflows                                    |
| `pnpm validate:examples`  | Validate and solve the checked-in sample                                   |
| `pnpm stress`             | Measure the 1,000-location scale fixture                                   |
| `pnpm build`              | Build the main process, isolated preload, and renderer into `out/`         |
| `pnpm package`            | Produce an unpacked desktop application                                    |
| `pnpm package:win`        | Produce unsigned Windows NSIS and portable artifacts in `release/`         |
| `pnpm eval:parser`        | Explain the optional live parser evaluation; makes no requests             |
| `pnpm eval:parser --live` | Run billable parser evaluations with `OPENAI_API_KEY` set                  |
| `pnpm format`             | Format source and documentation                                            |

TypeScript is pinned to 6.0.3 because the installed typescript-eslint version does not support the TypeScript 7 compiler API. Runtime dependencies are pinned and the pnpm lockfile is included with the source.

## OpenAI parsing

Open **Settings**, enter your own API key, choose a model, save preferences, and test the connection. The initial adapter model is `gpt-4.1-mini`; the model ID is configurable. API usage is charged to your provider account. No API key is needed to author, playtest, save, export, or use conventional commands.

The host uses Electron's OS-backed `safeStorage` when available. If protected storage is unavailable, credentials remain in memory. Model requests include the command, relevant player-visible context, and public action definitions. Read [the parser boundary and privacy details](docs/openai-parser.md).

## Explore the sample

Choose **Explore the sample**, then **Playtest**. Useful first commands are `look`, `take lantern`, `go stone arch`, and `examine shard`. The [complete walkthrough](docs/sample-walkthrough.md) is also stored as an executable scenario in `examples/the-folded-horizon/tests/scenarios.json`.

Use **Story tests** in the explorer to run the sample's complete solution without modifying an active playtest. During playtest, the inspector exposes actual rule checks and committed state changes. **Game view** hides the debugger and presents the player's inventory and discovered-world map.

## Documentation

- [Architecture and data ownership](docs/architecture.md)
- [Project, package, and save formats](docs/project-format.md)
- [Engine semantics](docs/engine-semantics.md)
- [Authoring guide](docs/authoring-guide.md)
- [OpenAI parser](docs/openai-parser.md)
- [Sample walkthrough](docs/sample-walkthrough.md)
- [Implementation status and verification](docs/implementation-status.md)

This is a development release. See the status document for the exact verified scope and remaining first-release requirements. Distribution is unsigned. Signing, license selection, and public release publication are separate owner decisions.

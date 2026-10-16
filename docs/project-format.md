# Project and runtime formats

All persisted application formats have a format identifier and schema version. Version 1 is supported. An unsupported newer version is rejected without modifying the original source.

## Authoring project

`project.elsewhen.json` contains `ProjectDefinition`: project metadata, starting location, turn policy, seed, locations, objects, characters/topics, directed connections, variables, custom actions, rules, and reusable types. Every reference stores a stable ID, not a display name. The full Zod definitions are in `packages/domain/src/index.ts`.

Objects have exactly one placement: `location`, `inside`, `on`, `character`, `player`, `offstage`, or `connection`. A shared door uses connection placement and is referenced by both associated exits. Capability lists describe supported built-in operations. Properties contain serializable scalar values.

Conditions are `all`, `any`, or `not` groups, comparisons, and typed scope/state tests. Effects are ordered data records. They never execute program text. Explicit `order`, `priority`, and stable ID resolve rule ordering.

Keys in serialized objects are sorted for readable, stable diffs. Arrays preserve authored ordering. Source saves use a temporary sibling file, flush, then rename. Before overwriting, the host compares the source fingerprint from the last load/save. External changes require saving a separate copy rather than silently replacing another editor's work.

Ten previous versions are retained under the project folder's `.elsewhen/backups`. Debounced recovery snapshots live in ElseWhen's application-data `recovery` directory, keyed by a hash of project ID. Reopening offers a newer recovery snapshot. A sibling `.lock` records the opening process; another opener can select read-only mode or explicitly take over an abandoned lock.

Never-saved drafts are listed on the welcome screen after restart. Recovery does not mark the restored source as saved. Save As acquires its destination lock before writing, so another active session's project cannot be overwritten through that route. Cancelled Quit operations retain the current source lock.

Scenario tests are stored separately in `tests/scenarios.json` with format `elsewhen-scenarios`. They are not exported. Unsaved projects use an application-data tests directory until their first source save.

## Migration policy

`migrateProject` clones data before migration. The registry currently supports the prototype version 0 to version 1 transformation (`name` becomes `title`, and the current format marker is set). A unit test proves the old object is preserved. Future migrations must be ordered, tested with retained fixtures, and followed by complete schema validation.

## Compiled game package

An `.elsegame` is a ZIP with exactly:

- `manifest.json`: `elsegame`, schema version, minimum runtime version, game ID, authored version, title, SHA-256 content hash.
- `game.json`: `elsewhen-runtime`, schema/runtime versions, normalized project runtime definition, matching hash.

Compilation removes note content and private parser examples. It resolves inherited object capability/property defaults. No credentials, local paths, user settings, scenario expectations, or editor history are exported. ZIP timestamps are fixed. Identical runtime content yields identical hashes and byte-identical packages.

Local packages necessarily contain puzzle logic. The privacy boundary is the player projection and parser context, not archive obfuscation.

## Portable saves

`.elsesave` stores `elsesave`, schema version, game ID, exact runtime content hash, logical state, transcript, and referent memory. Restoration requires both identity and hash to match. It validates the state, cancels outstanding interpretation, clears pending clarification/queues, and starts a new undo/redo history. It never migrates a save into a different game revision implicitly.

The native save dialog defaults to ElseWhen's application-data `saves` folder. Users may choose another path to export a named save.

## Settings and credentials

Settings and recent-project paths are application-data JSON. Encrypted credentials occupy a separate `credential.bin`; plaintext credentials are not serialized. Theme, panel sizes, map preference, and transcript font size are renderer-local preferences. Neither projects nor exported games receive them.

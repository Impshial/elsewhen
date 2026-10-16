# Formats and migration

## Source projects

Version 2 .elsewhen.json files preserve stable entity IDs, descriptions, aliases, map positions, capabilities, typed properties, grammar forms and declarative rules. Runtime state is separate. Tests live in a sibling tests/scenarios.json file.

Opening a version-one project upgrades a copy. Legacy roles map to semantic item/instrument/recipient roles; recognized directions become canonical direction metadata. Unusual directions remain aliases and receive a review notice. The prototype speech action maps to built-in Say. Old descriptive examples remain descriptions, not executable grammar.

Ambiguous legacy Put rules, ignored Check effects and ambiguous event captures block export until reviewed. Their original data is retained in migration records. Save As is required for upgraded files, preserving the original source. Future unsupported schemas fail without changing files.

## Compiled games

.elsegame is a bounded ZIP with exactly manifest.json and game.json. Runtime and manifest versions are 2. The compiler resolves reusable types, validates effective behavior, strips notes/private test examples/migration records and creates vocabulary/grammar catalogs. SHA-256 covers the versioned runtime semantics and data. Import recompiles and checks identity/hash. Duplicate, unexpected, unsafe and oversized archive entries are rejected.

## Saves

Version-two .elsesave files contain game identity and exact runtime hash; placements and occupancy; object/character properties; discovery; variables; consumed entities; scheduled instance IDs and order; turn/RNG/ending; transcript; discourse/repeat state; and pending question plus suspended clauses.

Restore validates a complete candidate before changing the session. Incompatible version-one saves require the original application. A successful restore starts a fresh undo history. A failed or canceled restore preserves the current session.

## Storage

Writes use temporary files, flush and rename. Project locks, external-change fingerprints, rolling backups and separate recovery snapshots protect authoring work. Source and saves never include credentials. On startup, only the retired application-owned credential.bin is removed without reading it; settings migration retains recent projects and unrelated preferences.

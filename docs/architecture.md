# Architecture

The domain owns serializable entities, capabilities, explicit grammar forms, standard action definitions, rules and state contracts. The compiler resolves template inheritance, validates effective capabilities and references, compiles vocabulary/grammar catalogs, strips private authoring information and hashes the versioned runtime definition. Compiled definitions are frozen.

The lexer preserves token spans and quoted text. The bounded grammar matcher considers role boundaries and emits structured command candidates. The resolver binds those candidates using public observations and shared engine scope facts. It indexes public vocabulary, ranks lexical specificity before scope preferences and produces resolved actions, questions or diagnostics. Parsing never mutates game state.

The host Session owns world state, discourse, clarification, queues, history and portable saves. Each explicit action or bulk member uses the same transactional engine pipeline. Map travel supplies an exact exit ID to that pipeline. The engine owns consequences, time, seeded randomness, perception and rule dispatch.

## Modules

| Area                                           | Responsibility                                    |
| ---------------------------------------------- | ------------------------------------------------- |
| packages/domain/src/action-library.ts          | Standard forms, role names and directions         |
| packages/domain/src/conversation.ts            | Discourse, parsed commands and saved questions    |
| packages/domain/src/migration.ts               | Copy-based source upgrade and review records      |
| packages/parser/src/lexer.ts                   | Tokenization, quotes and resource limits          |
| packages/parser/src/grammar.ts                 | Bounded grammar matching and clause boundaries    |
| packages/parser/src/resolver.ts                | Public reference matching, quantities and answers |
| packages/engine/src/index.ts                   | Queries, transactions, rules, actions and turns   |
| packages/persistence/src/index.ts              | Atomic files, locks, recovery, packages and saves |
| apps/desktop/src/main/session.ts               | Active session, checkpoints and commands          |
| apps/desktop/src/main/scenarios.ts             | Isolated scenario assertions                      |
| apps/desktop/src/renderer/VocabularyEditor.tsx | Vocabulary and command-form authoring             |

## Desktop security and windows

Electron renderers use context isolation, sandboxing and disabled Node integration. The preload exposes an explicit operation allowlist. The main process verifies both sender and main frame. The detached player receives a reduced operation set and public session views; designer snapshots and diagnostic contexts remain in the designer.

One host-owned session serves embedded and detached surfaces. Only the active player surface can submit world input. Window transfer changes presentation ownership, not world state. Host broadcasts synchronize designer diagnostics. Pending file restores check session identity and revision before applying data. Each subscription returns a cleanup function.

The engine has no React, Electron, network, filesystem or wall-clock dependency. The application has no language-service adapter or credential requirement.

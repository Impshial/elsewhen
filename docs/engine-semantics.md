# Engine semantics

## Action pipeline

The engine accepts a compiled project snapshot, explicit state, and one canonical action. It validates identifiers, parameter types, public discovery membership, and role-specific scope before executing authored behavior. A transaction works on a clone and buffers all output.

1. Structural validation rejects malformed or undiscovered IDs without a turn.
2. Scope checks establish whether each role is accessible, reachable, carried, visible, or merely known.
3. Check rules run in descending priority, author order, then stable ID. A failed check returns its authored refusal.
4. The first successful Handle rule runs. If none succeeds, the first matching Otherwise refusal is selected; otherwise the built-in operation runs.
5. Successful actions run After rules against the evolving draft.
6. Immediate leave/enter/named events drain in deterministic order.
7. The turn cost is applied. Due events run, then turn-end events.
8. Observations refresh, state invariants are checked, and state/output commit together.

An internal exception rolls back state, RNG, output, event scheduling, and turn cost. An ordinary in-world refusal commits its configured turn cost and may trigger due events. Parser errors, ambiguity, cancellations, and unsupported commands are not world actions.

## Scope

Existence, discovery, current visibility, reachability, and transitive carrying differ. A token in a closed opaque box is hidden. A transparent box exposes eligible contents but still blocks physical access. Carrying a closed box transitively carries its contents; accessible-tool roles still require an open containment chain.

Opening a container reveals currently visible contents. Previously observed objects retain remembered public names/descriptions without receiving their remote live state. Darkness uses active visible light sources; opaque containment blocks illumination. Carried-item interaction and authored exits marked navigable in darkness remain available.

Visiting reveals a location. Observing an exit records its label; its unvisited destination stays anonymous unless the author explicitly reveals it. A known exit can still be attempted when a visibility condition changes. Enabled state and traversal conditions determine actual permission.

## Built-ins and turns

Look, examine, inventory, and read cost zero turns. Movement, manipulation, conversation, use, and wait cost one by default. Custom actions declare their own cost. A recognized refusal consumes that cost unless the project makes failed attempts free.

Shared doors have a single open/locked state visible from both endpoints. Moving through an unlocked closed door implicitly opens it inside the same transaction and records the subaction. Door keys are authored references. Built-ins never infer a puzzle solution from map layout.

Put operations check parent capabilities, open state, direct-item count capacity, and containment cycles. Moving a container preserves descendant placement. Worn objects remain carried.

## Events and randomness

Delay 1 means one future consumed turn after the scheduling action's resulting turn. Read-only zero-turn observations do not advance scheduled events. Scheduling captures serializable argument bindings. Immediate events use a separate effect.

Moving the player queues leave followed by enter, with `from` and `to` bindings. Events see the post-move draft. Use a Check rule to prevent departure.

At most 100 event/effect/rule work units execute in one transaction. Exceeding the bound reports a diagnostic and rolls back instead of hanging. End-game effects must be last in a list, commit the action's normal cost, and stop further event dispatch.

Random effects use the stored LCG state. The same initial seed and canonical action sequence reproduce logical state and authored output without calling OpenAI.

## History and sessions

The host retains 100 checkpoints, including zero-turn observations. Undo and redo restore state, discovery, event schedule, RNG, referents, and transcript boundaries together. Redo uses stored results. New actions after undo clear the redo branch.

Command-input history is separate from world history. A semicolon queue is limited to eight commands and respects quoted semicolons. Each step uses fresh context. The queue stops on ambiguity, refusal, unsupported input, cancellation, or ending; remaining commands must be explicitly resubmitted.

Cancellation increments a host epoch/revision and aborts the request. A late response cannot match the active session revision. Restart creates a fresh state and runs initial events once. Designer debug mutations are explicitly marked, undoable, and rejected in exported player sessions.

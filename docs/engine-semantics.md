# Engine semantics

## Actions and rules

Every action validates its registered roles, entity identities and current scope. A draft transaction buffers state and output. Requirements are pure: Applies when selects whether a requirement governs the action; its condition must then pass. Check effects are rejected, with legacy effects retained in migration review records.

The first eligible Instead/Handle rule supplies an explicit success or refusal. Otherwise the standard operation runs. All matching After rules run in priority, author order and stable-ID order. Response rules can replace or append the standard report without replacing the operation. Immediate events drain in FIFO order after the operation.

Go opens an unlocked closed door through the same Open pipeline. The child consumes no extra turn, history checkpoint or event drain, and the door must actually be open afterward. A refused parent rolls back provisional child changes and output. Invoke action effects use this pipeline too; stop, report and ignore control an ordinary child refusal. Recursion shares the 100-unit transaction work budget.

Internal failures roll back state, output, queued events, RNG and time. Ordinary refusals restore provisional action changes, then consume the configured refusal cost and process any resulting turn events.

## Scope, containment and actors

Public identity, present visibility, reachability, direct possession and nested carrying differ. Closed transparent containers allow sight but block reach; opaque interiors also block light. Supported contents remain outside the closed interior. Scenery can emit light without appearing in ordinary item listings.

Objects and actors use containment ancestry with cycle checks. Player occupancy tracks inside/on separately from the effective room. Enter requires capacity and access. Ordinary Go requires leaving the enclosure first. Moving an occupied enclosure preserves its occupants and updates effective rooms. OUT leaves current occupancy before attempting an outward connection.

NPC possessions have visibility and taking-permission settings. Give transfers possession if accepted; Show does not. Character property changes use runtime state. Consumables move offstage and retain their source definitions, making consumption undoable.

Known remote identities retain public vocabulary, but Examine and Read require current observation. Hidden, undiscovered entities do not enter candidate menus or quantifier selections.

## Time

Look, Examine, Inventory, Read and Look in/under/behind are free. Search and other standard actions cost one turn; custom actions configure cost. Every consumed turn processes due instances followed by turn rules. Due order is due tick, rule priority and insertion sequence. Scheduled instances have stable IDs; cancellation can target an instance or definition.

Delay 1 is anchored after the scheduling action's resulting turn. Scheduling inside a turn/event drain is anchored to the current tick. An ending reached before turn advancement charges the action's cost without further dispatch; an ending during a tick stops remaining ticks. Zero-turn actions remain zero-turn.

Random effects use saved deterministic LCG state. The same game, seed, state and command sequence reproduce outcomes.

## Language, queues and history

The lexer checks the entire input before execution. Limits are 8,000 characters, 2,048 tokens, 32 clauses, 128 grammatical alternatives, 20,000 grammar work steps and 100 bulk targets. Excess input fails explicitly.

Whole known names protect conjunctions and prepositions. Quoted phrases protect separators and support escaped quotes/backslashes. Free conversation text keeps AND as part of the topic; use THEN or a semicolon to follow it with another command. Every significant noun token must match; fuzzy execution is never performed.

Each clause resolves against state after earlier clauses. Refusal stops later clauses without undoing previous successes. Questions suspend their remainder; an answer resumes it, while a new command or Cancel discards it. Bulk targets are resolved and frozen first. Ordinary per-item refusals continue through that bulk clause, then stop subsequent clauses.

Take all selects eligible reachable portable objects and does not separately empty a selected outer container. Drop all and Put all select directly held unworn objects. Exclusions resolve before execution. Quantities ask for a subset when more distinct candidates exist than requested.

Discourse tracks object focus, explicitly configured character pronouns, plural groups, conversation and repeat selectors. Again repeats a single action; movement resolves its selector from the new room. Sequences and bulk requests are not repeatable.

The host retains 100 checkpoints. Undo cancels pending work before restoring the previous committed action; Redo restores recorded results without rerunning randomness. Portable saves include pending questions and queues but exclude undo/redo stacks. Restoring never automatically answers a question or executes its remainder.

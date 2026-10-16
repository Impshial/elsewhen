# Command reference

Commands use the names and vocabulary configured by the author. Matching is case-insensitive; terminal punctuation is ignored. Quotes preserve names, semicolons and conjunctions. Every significant word must match: `take key banana` does not silently become `take key`.

The Vocabulary workspace lists the exact current forms, including configured synonyms and custom actions. HELP and COMMANDS display help without taking a turn.

| Action                | Forms and examples                                                                                                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Observe               | `look` / `l`; `inventory` / `i`; `examine key` / `inspect key` / `look at key` / `x key`; `read note`                                                                                                                                              |
| Wait                  | `wait` / `z`; `wait 3` (up to 32 individual turns)                                                                                                                                                                                                 |
| Search                | `look in drawer`; `look inside drawer`; `look under desk`; `look behind curtain`; `search desk`                                                                                                                                                    |
| Take                  | `take key`; `get key`; `pick up key`; `pick key up`; `grab key`; `take key from drawer`; `get key from drawer`; `remove key from drawer`                                                                                                           |
| Drop and place        | `drop key`; `put down key`; `put key in box`; `put key into box`; `insert key into box`; `put key on desk`; `place key onto desk`                                                                                                                  |
| Open and lock         | `open drawer`; `close drawer` / `shut drawer`; `unlock drawer with key`; `lock drawer with key`                                                                                                                                                    |
| Clothing              | `wear coat`; `put on coat`; `put coat on`; `remove coat`; `take off coat`; `take coat off`                                                                                                                                                         |
| Switches              | `switch on lamp`; `turn on lamp`; `switch lamp on`; `turn lamp on`; corresponding `off` forms                                                                                                                                                      |
| Consume               | `eat apple`; `drink potion`                                                                                                                                                                                                                        |
| Occupancy             | `enter basket`; `get in basket`; `get into basket`; `sit on bench`; `exit`; `get out`; `get off`; `leave`                                                                                                                                          |
| Travel                | `go north`; `go arch`; `go to courtyard`; `go through rusty door`; `walk to courtyard`; `walk through arch`; `enter arch`                                                                                                                          |
| Give and show         | `give photograph to caretaker`; `show photograph to caretaker`                                                                                                                                                                                     |
| Conversation          | `talk to caretaker`; `talk with caretaker`; `talk caretaker`; `ask caretaker about photograph`; `tell caretaker about the storm`; `say "hello"`; `say "hello" to caretaker`; `speak "hello" to caretaker`                                          |
| Authored interactions | `use shard`; `use shard on anchor`; `use shard with anchor`; `cut rope with knife`; `push`, `pull`, `turn`, `touch`, `listen`, `smell`, `taste`, `knock`, `attack`, or `climb` followed by a target; also `listen to target` and `knock on target` |

Directions are north/n, northeast/ne, east/e, southeast/se, south/s, southwest/sw, west/w, northwest/nw, up/u, down/d, in and out. Hyphenated diagonal names also work. Directions use connection metadata, never map geometry. Public destination names select a current outgoing connection; they do not find a route through multiple rooms. OUT leaves an occupied object before selecting an outward connection.

## Automatic behavior and authored hooks

Take/Drop, inside/on placement, Open/Close, Lock/Unlock, clothing, switching, consuming, occupancy and travel have standard capability-based behavior. Travel implicitly opens an unlocked door through Open's normal requirements and consequences. Give checks recipient permission and transfers the item; Show keeps it held. Conversation uses greetings, available topics and fallback responses. Read uses authored writing and sufficient light.

Use, Cut, sensory/manipulation verbs, attacks and climbing do not infer a solution or invent consequences. They provide recognized action hooks with ordinary fallback reports/refusals; add requirements, Instead consequences, After effects or Response rules to customize them. Search and Look inside report accessible visible contents; hidden discoveries require authored behavior. No automatic combat, fluid or weight simulation is included.

## Questions, groups and sequences

`unlock drawer` asks for the instrument. Answer with a name, distinguishing adjective or numbered choice. A numbered answer selects the displayed identity even if two labels match. A quantity question accepts distinct choices such as `1 and 3`. A fresh command replaces a pending question; CANCEL discards it and its suspended sequence.

`take key and photograph`, `take all except brass key`, `take two coins` and `drop them` select explicit groups. The target group is frozen before execution. Each member still checks current access. Take all avoids separately emptying a portable container it selects. Drop/Put all use directly held unworn items. A group has at most 100 targets.

Separate commands with THEN or semicolons, for example `open drawer then take photograph`. Later clauses resolve after earlier changes. Refusals stop subsequent clauses; questions suspend them. Whole known names such as Salt and Pepper remain intact. Free conversational topics preserve AND; use THEN or a semicolon to start a following command.

IT follows the main object, not the last instrument. HIM/HER/THEM use configured character pronouns and the established plural group. A stale reference never selects an undiscovered replacement. AGAIN / G repeats a single action; a direction is resolved again from the new location. Groups and sequences cannot leave their last member as an accidental repeat target.

## Session controls and limits

SAVE, RESTORE / LOAD, UNDO, REDO, RESTART, HELP, COMMANDS and CANCEL do not themselves consume turns. Save and restore use native dialogs. A saved pending question returns as a question. Undo first cancels pending work and then restores the previous committed action. Restore starts a fresh undo/redo history.

Look, Examine, Inventory, Read and Look in/under/behind are free. Search and other standard actions cost one turn; recognized refusals follow the project's failed-attempt policy. Parser failures and questions cost none. Input is bounded to 8,000 characters, 2,048 tokens and 32 clauses. Over-limit requests fail explicitly. Grammar matching is bounded too; this is a predictable English command parser, not unrestricted conversation.

# The Folded Horizon

Choose **Explore the sample** on the welcome screen, then **Playtest**. The sample is an original short adventure built with ordinary ElseWhen project data. No sample-specific outcomes are embedded in the engine.

Seven locations form an abstract world: Nexus, Crystal Cavern, Gate Chamber, Sunken Archive, Echo Dimension, Observatory, and Silent Shore. The map's coordinates are presentation data; only authored connections and effects move the player.

## Complete solution

Enter these commands in order:

```text
take lantern
go stone arch
take shard
go stone arch
go spiral stair
open case
take token from case
unlock brass gate with token
open brass gate
go brass gate
read star chart
go brass gate
go spiral stair
use shard on anchor
go wormhole
go silver thread
say "Meridian" to prism console
go horizon seam
```

This reaches ending `homeward` after 18 commands and 17 turns. Reading is free. `look`, `inventory`, and `examine` can be inserted without increasing the turn count.

## How the puzzles work

- **Sealed Case:** an initially closed, opaque, openable container. Opening exposes the Brass Token. The token acts as the key for the shared Brass Gate object on the two directed gate connections.
- **Star Chart:** a readable object in the Sunken Archive. Its authored text reveals the word Meridian. The archive also contains two books with overlapping aliases, so `read book` asks which one without consuming a turn.
- **Wormhole:** an initially concealed and disabled connection from Nexus. Using the carried shard on the reachable anchor invokes Activate wormhole, sets the Dormant state to Active, enables/reveals the exit, and prints the activation response. The destination remains unexplored until visited.
- **Prism Console:** the custom Speak action takes text and a listener. A rule compares normalized text with Meridian. Success reveals/enables Horizon Seam. Wrong words receive an authored refusal.
- **Homeward:** an enter event at Silent Shore ends the story. Subsequent actions stop until undo, restore, or restart.

The Archivist offers optional authored dialogue in the archive. The designer's rule editor, object editor, dialogue editor, and debugger can inspect every part of the story.

## Repeatable verification

The source is `examples/the-folded-horizon/project.elsewhen.json`. Its canonical generator is `sample.ts`; run `pnpm generate:example` after changing that authoring fixture. The complete solution also lives in `tests/scenarios.json` and the application's **Story tests** editor.

`pnpm validate:examples` validates the project and executes the walkthrough using the same compiler, conventional parser, and engine as the application. Electron end-to-end tests additionally play the walkthrough through the command box and complete an exported package after saving and restoring progress.

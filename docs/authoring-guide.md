# Build a small world

Start ElseWhen and choose **Create a world**. A valid starting location, **The Beginning**, is created for you. The sample is also a writable in-memory copy: opening it never changes the bundled example.

## Places and connections

1. Select **The Beginning** in the explorer. Change its name and description. Descriptions support paragraphs and safe emphasis; raw HTML is displayed as text.
2. Click the **+** beside **Locations** and create **The Gallery**. Its general form controls category, region, darkness, starting visibility, color, and map appearance.
3. Add a **Connection**. Name it **Silver Door**, select The Beginning as its source and The Gallery as its destination. Choose the kind and whether to create a return connection.
4. A connection is a directed edge. A reverse pair is two linked edges; their availability can differ. A shared door object gives both sides the same open/locked state. Names such as portal, dream, passage, and wormhole describe the connection without imposing physical floor-plan rules.

Open **World map** to rotate, pan, and zoom. Click a location to inspect it; double-click it to open its editor. Select an edge to edit its endpoints and conditions. **Frame all** resets the view. Top, Front, and Side use orthographic cameras. Use **2D** for an SVG graph without WebGL, or the list view for keyboard access. In 2D, Shift-drag moves a node. The location inspector also accepts exact X/Y/Z coordinates. **Auto arrange** changes unpinned positions and can be undone.

Ctrl/Cmd-click adds locations to the selection; **Frame selection** centers them. **Move selected location** enables a three-axis translation gizmo in the 3D and orthographic views. **Snap** rounds placement to whole layout coordinates. **Connect selected location** starts a connection operation: select its destination, then name it in the connection dialog. Escape cancels connection creation or exits the move tool. Right-click the canvas for **Add location**. The region selector filters designer nodes without changing travel rules. Player mode also offers **Focus current location** and exact-exit **Travel** after selecting an outgoing edge or its list entry.

## A container puzzle

1. Add an object named **Tin Box** at The Beginning. Enable **Container** and **Openable**; leave its initial open state unchecked.
2. Add **Glass Bead**, enable **Portable**, choose **Inside** placement, and select Tin Box as its parent.
3. Start **Playtest**. Enter `open tin box`, then `take glass bead from tin box`. The inventory and trace update from the actual engine result.

Closed opaque containers hide their contents. Transparent closed containers allow sight but prevent reaching inside. A carried bag's contents are transitively carried, but still must be accessible. Supporters hold objects **on** them. Moving through the placement form preserves stable object IDs and their references.

## Variables and rules

Create a boolean variable, such as **Gallery lit**, initially false. Add a rule and use the visual blocks:

- **WHEN:** choose a phase, action, and optional bindings. Binding a tool or target narrows the rule to those entities; an empty binding matches any value.
- **IF:** combine conditions using All, Any, or Not. Test possession, reachability, discovery, object state, variable values, and action arguments.
- **THEN:** add ordered effects, such as setting the variable and printing authored text. Effects can move entities, reveal/enable connections, schedule events, change properties, choose deterministic random branches, or end the story.
- **OTHERWISE:** supply an authored refusal when the requirement is not met.

Check rules impose requirements; one matching Handle rule supplies the outcome; After rules add successful-action behavior. Event rules react to start, enter, leave, turn, or named events. Priority, author order, and stable ID determine ordering. See [engine semantics](engine-semantics.md) before combining several handlers.

The sample's **Activate wormhole** rule is a working example. It binds `use` to the Resonance Shard and Wormhole Anchor, requires the Dormant variable value, then changes that value and reveals/enables the wormhole.

## Characters and reusable types

Characters have a location, description, greeting, fallback response, and dialogue topics. Each topic has aliases, an availability condition, authored response, and response effects. `talk to archivist` uses the greeting; `ask archivist about observatory` resolves a known topic. Unknown subjects use the authored fallback unless a rule handles `askText`.

Reusable types supply inherited capabilities and typed property defaults. Child defaults override parent defaults; object values override both. Custom actions define typed parameters, scope, examples, aliases, turn cost, and default refusal. The conventional syntax for a custom alias uses `|` between parameter values; the sample also supports `say "Meridian" to prism console`.

## Play, inspect, and preserve your work

Playtest compiles a snapshot. **Design** returns to authoring without losing the session; **Resume playtest** continues the same snapshot. A notice appears if the source changed. **Restart** recompiles current authoring data. The debugger shows canonical intent, rule checks, effects, state changes, and parser diagnostics. Designer controls can teleport, grant objects, change variables, or reveal the map; these edits are undoable and do not modify the source.

Use **Story tests** to create a sequence of conventional commands and an optional expected ending. **Run scenario** uses an isolated session; **Save tests** writes a separate scenarios file. Save tests before leaving this editor. Scenarios are not exported to players.

Save your project as `project.elsewhen.json`. Editor undo/redo is separate from player undo/redo. Saving creates rolling backups. Unsaved edits are recovered separately after a delay; reopening a saved project offers newer recovery data. A restored project remains marked unsaved until you save it. Use **Save As** to resolve external file changes or make a writable copy of a read-only project.

After restarting, the welcome screen lists recoverable drafts that were never saved to a source file. Closing an edited project asks whether to save, close with recovery retained, or cancel.

The project-title dialog edits title, author, version, and opening text. Its **Export game** command produces an `.elsegame` package. Players open it with ElseWhen and can save progress as `.elsesave`. They need neither your source folder nor an API key for conventional play.

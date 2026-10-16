# Authoring guide

## Build a world

Choose Create a world. The World Explorer groups Locations, Objects, Characters, Connections, Custom Actions, Rules & events, Variables and Reusable types. Add Entity creates a named record with an internal stable ID.

A location's type and region organize the authoring world. Map icon and color affect appearance; coordinates never create exits. Add directed connections, choose a direction when appropriate, and pair reverse routes explicitly. New ordinary connections reveal their destination name; hidden routes can conceal it.

## Vocabulary

Names are understood automatically. Add aliases, noun phrases, adjectives and plural forms as chips. Tags, notes, regions and description prose are not parser vocabulary. Vocabulary browses standard forms, maps a verb synonym to a specific form, and previews a command without executing it.

## Objects and characters

Choose capabilities using plain labels: can be picked up, can hold things inside, can hold things on top, can be opened/locked/worn/entered, has writing, emits light, can be switched on/off, can be eaten/drunk, scenery or shared door. Select a key by name and choose initial state. Contents and placement form one hierarchy.

For a drawer puzzle, create a key, an openable/lockable container, select the key, mark the drawer locked, and place the photograph inside. The standard Take, Unlock, Open and Take from actions do the rest.

Characters have explicit pronouns, possession visibility/permission, gift acceptance, greetings, topics and conditional responses. Named property definitions are created in Vocabulary and selected in property overrides and rules.

## Custom actions and behavior

Create a Custom Action. Choose a verb phrase and command shape, then Add command form. Add alternate verbs/forms using the same role chips. Role labels, types and access constraints describe what the player supplies. Configure turn cost and a default refusal.

Add requirement, consequences, After rule or response to open the shared visual rule editor. Entity-local Rules links point to these same global records. Requirements cannot perform effects. Instead outcomes can explicitly refuse. Response rules customize narration while preserving the standard operation.

Create named events, endings and typed entity properties in Vocabulary, then choose them in rule controls. Invoke action runs another action through normal checks; choose how a refusal affects the current handler. Insert text token adds a name, variable or supplied-text reference without typing token syntax.

## Play and test

Playtest starts an immutable compiled snapshot. Editing the designer does not change the running story; restart to compile current edits. The Action inspector distinguishes interpretation, questions, refusals, rules and changes. Technical IDs are available in expandable diagnostic details.

Open Game Player moves the current playtest into a native window containing the transcript, inventory and discovered-world map. Return to designer or close that window to reattach. Designer edits remain available while it is detached.

Story tests run in isolated sessions. Add assertions for an action, selected entity, question, refusal, location, inventory, state/property, variable, turn, ending or output text. Expected questions/refusals count as successful tests when their assertions pass. Save tests separately before switching projects.

## Export and upgrade

Save source projects for continued editing. Export game creates an offline .elsegame package for the ElseWhen player. Review upgrade notices in Vocabulary and use Save As for migrated source files. Dark/light theme, transcript text size, search and follow controls work in the player.

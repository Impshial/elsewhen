import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  blankProject,
  objectSchema,
  characterSchema,
  connectionSchema,
  variableSchema,
  ruleSchema,
  effect,
  actionSchema,
  formParts,
  standardActions,
  actionCatalog,
} from '../packages/domain/src/index';
import { compile } from '../packages/compiler/src/index';
import { startGame, scope, execute, illuminated } from '../packages/engine/src/index';
import { migrateProject, readSave } from '../packages/persistence/src/index';
import { Session } from '../apps/desktop/src/main/session';
import { runScenario } from '../apps/desktop/src/main/scenarios';
import { scenarioSchema } from '../packages/domain/src/scenarios';
import { localAdventure } from '../examples/local-adventure/sample';
import { walkthrough } from '../examples/the-folded-horizon/sample';
import { matchGrammar } from '../packages/parser/src/grammar';
const session = () => new Session(compile(localAdventure()), true);

it('moves a character offstage and restores its placement from a save', async () => {
  const p = localAdventure();
  p.rules.push(
    ruleSchema.parse({
      id: 'depart',
      name: 'Caretaker leaves',
      trigger: 'wait',
      effects: [effect('move', { ref: 'caretaker', placement: { kind: 'offstage', id: '' } })],
    }),
  );
  const s = new Session(compile(p), true);
  await s.command('wait');
  expect(s.last?.success).toBe(true);
  expect(s.state.characters.caretaker).toBe('');
  const saved = s.save();
  s.undo();
  expect(s.state.characters.caretaker).toBe('courtyard');
  s.restore(saved);
  expect(s.state.placements.caretaker.kind).toBe('offstage');
});

it('rejects a cycle through character possession and object containment at compilation', () => {
  const p = localAdventure();
  p.characters[0].placement = { kind: 'inside', id: 'drawer' };
  p.objects.find((o) => o.id === 'drawer')!.placement = { kind: 'character', id: 'caretaker' };
  expect(() => compile(p)).toThrow('own enclosing entity');
});

it('keeps passive observation free and active searching at one turn', async () => {
  const s = session();
  for (const command of ['look in case', 'look under desk', 'look behind desk'])
    await s.command(command);
  expect(s.state.turn).toBe(0);
  await s.command('search desk');
  expect(s.state.turn).toBe(1);
});

it('rejects custom forms that would be hidden by a reserved session command', () => {
  const p = localAdventure();
  p.actions[0].forms = [{ id: 'bad', parts: formParts('undo {target}') }];
  expect(() => compile(p)).toThrow('reserved session command');
});

it('fully consumes every registered standard command form', () => {
  const p = localAdventure(),
    context = { actions: actionCatalog(p), entities: [], exits: [], topics: [] };
  for (const action of standardActions)
    for (const form of action.forms) {
      const input = form.replace(/\{([^}]+)\}/g, (_, role: string) => `example ${role}`);
      expect(
        matchGrammar(input, context).some(
          (match) => match.command.actionId === action.id && match.missing === 0,
        ),
        input,
      ).toBe(true);
    }
});

it('keeps a remembered pronoun from acting on a replacement object', async () => {
  const p = localAdventure();
  p.rules.push(
    ruleSchema.parse({
      id: 'hide-key',
      name: 'Hide the key',
      phase: 'after',
      trigger: 'examine',
      bindings: { target: 'key' },
      effects: [effect('move', { ref: 'key', placement: { kind: 'offstage', id: '' } })],
    }),
  );
  p.objects.push(
    objectSchema.parse({
      id: 'other-key',
      name: 'Iron Key',
      aliases: ['key'],
      capabilities: ['portable'],
      placement: { kind: 'location', id: p.start },
    }),
  );
  const s = new Session(compile(p), true);
  await s.command('examine brass key');
  await s.command('take it');
  expect(s.state.placements.key.kind).toBe('offstage');
  expect(s.state.placements['other-key'].kind).toBe('location');
});

it('preserves possession on Show and transfers it on Give', async () => {
  const p = localAdventure();
  p.characters[0].location = p.start;
  const s = new Session(compile(p), true);
  await s.command('take key');
  await s.command('show key to caretaker');
  expect(s.state.placements.key.kind).toBe('player');
  await s.command('give key to caretaker');
  expect(s.state.placements.key).toEqual({ kind: 'character', id: 'caretaker' });
  s.undo();
  expect(s.state.placements.key.kind).toBe('player');
});

it('restores consumption, random outcomes and plural focus through undo and redo', async () => {
  const p = blankProject();
  p.objects = ['apple', 'pear'].map((id) =>
    objectSchema.parse({
      id,
      name: id,
      capabilities: ['portable', 'edible'],
      placement: { kind: 'location', id: p.start },
    }),
  );
  p.rules = [
    ruleSchema.parse({
      id: 'flavor',
      name: 'Random flavor',
      phase: 'after',
      trigger: 'eat',
      effects: [
        effect('random', {
          branches: [[effect('print', { text: 'Sweet.' })], [effect('print', { text: 'Tart.' })]],
        }),
      ],
    }),
  ];
  const a = new Session(compile(p), true),
    b = new Session(compile(p), true);
  for (const s of [a, b]) {
    await s.command('take apple and pear');
    await s.command('eat apple');
  }
  expect(a.save()).toEqual(b.save());
  const eaten = a.save();
  a.undo();
  expect(a.state.consumed).toEqual([]);
  expect(a.discourse.plural).toEqual(['apple', 'pear']);
  a.redo();
  expect(a.save()).toEqual(eaten);
});

it.each(['take brass key', 'get the brass key.', 'pick up BRASS KEY!', 'grab "Brass Key"'])(
  'resolves the complete synonym form %s',
  async (command) => {
    const s = session();
    await s.command(command);
    expect(s.last?.action).toEqual({ actionId: 'take', args: { item: 'key' } });
    expect(s.last?.success).toBe(true);
  },
);
it('preserves text containing conjunctions, directions and escaped quotation marks', async () => {
  const p = localAdventure();
  p.characters[0].location = p.start;
  const s = new Session(compile(p), true);
  await s.command('ask caretaker about north and south');
  expect(s.last?.action.args.text).toBe('north and south');
  await s.command('say "wait; then go north" to caretaker');
  expect(s.last?.action.args.text).toBe('wait; then go north');
  await s.command('say "a \\"quoted\\" word" to caretaker');
  expect(s.last?.action.args.text).toBe('a "quoted" word');
});
it('matches a character name containing a preposition as a complete phrase', async () => {
  const p = localAdventure();
  p.characters.push(characterSchema.parse({ id: 'man', name: 'Man in Black', location: p.start }));
  const s = new Session(compile(p), true);
  await s.command('examine Man in Black');
  expect(s.last?.action.args.target).toBe('man');
});
it('does not substitute a local partial match for an exact remembered remote identity', async () => {
  const p = localAdventure();
  p.objects.push(
    objectSchema.parse({
      id: 'iron',
      name: 'Iron Key',
      aliases: ['key'],
      placement: { kind: 'location', id: 'courtyard' },
      capabilities: ['portable'],
    }),
  );
  const s = new Session(compile(p), true);
  s.debugChange({ kind: 'teleport', ref: 'courtyard', value: null });
  await s.command('take brass key');
  expect(s.last?.action.args.item).toBe('key');
  expect(s.last?.success).toBe(false);
  expect(s.state.placements.iron.kind).toBe('location');
});
it('does not repeat a bulk command, even if only one item matched', async () => {
  const s = session();
  await s.command('take all except lamp');
  expect(s.state.placements.key.kind).toBe('player');
  expect(s.state.placements.lamp.kind).toBe('on');
  const turn = s.state.turn;
  await s.command('again');
  expect(s.state.turn).toBe(turn);
  expect(s.transcript.at(-1)?.text).toContain('not repeatable');
});
it('takes an outer portable container without separately emptying it', async () => {
  const p = localAdventure();
  p.objects = [
    objectSchema.parse({
      id: 'bag',
      name: 'Bag',
      placement: { kind: 'location', id: p.start },
      capabilities: ['portable', 'container'],
    }),
    objectSchema.parse({
      id: 'bead',
      name: 'Bead',
      placement: { kind: 'inside', id: 'bag' },
      capabilities: ['portable'],
    }),
  ];
  p.connections = [];
  p.rules = [];
  const s = new Session(compile(p), true);
  await s.command('take all');
  expect(s.state.placements.bag.kind).toBe('player');
  expect(s.state.placements.bead).toEqual({ kind: 'inside', id: 'bag' });
  expect(s.state.turn).toBe(1);
});
it('freezes bulk targets and revalidates their scope after events', async () => {
  const p = blankProject();
  p.failedAttemptsCostTurn = false;
  p.objects = ['a', 'b', 'c'].map((id) =>
    objectSchema.parse({
      id,
      name: id,
      concealed: id === 'c',
      capabilities: ['portable'],
      placement: { kind: 'location', id: p.start },
    }),
  );
  p.rules = [
    ruleSchema.parse({
      id: 'after-a',
      name: 'After A',
      phase: 'after',
      trigger: 'take',
      bindings: { item: 'a' },
      effects: [
        effect('move', { ref: 'b', placement: { kind: 'offstage', id: '' } }),
        effect('reveal', { ref: 'c' }),
      ],
    }),
  ];
  const s = new Session(compile(p), true);
  await s.command('take all');
  expect(s.state.placements.a.kind).toBe('player');
  expect(s.state.placements.b.kind).toBe('offstage');
  expect(s.state.placements.c.kind).toBe('location');
  expect(s.state.turn).toBe(1);
});
it('stops a sequence at a refusal, retaining earlier successes', async () => {
  const s = session();
  await s.command('take key; open drawer; take lamp');
  expect(s.state.placements.key.kind).toBe('player');
  expect(s.state.placements.lamp.kind).toBe('on');
  expect(s.state.turn).toBe(1);
});
it.each(['n', 'northeast', 'ne', 'up', 'down', 'in', 'out'])(
  'uses explicit direction metadata for %s',
  async (direction) => {
    const p = localAdventure();
    p.objects = p.objects.filter((o) => o.id !== 'door');
    p.connections = [
      connectionSchema.parse({
        id: 'exit',
        name: 'WaitToCourt',
        from: p.start,
        to: 'courtyard',
        direction:
          ({ n: 'north', ne: 'northeast' } as Record<string, string>)[direction] ?? direction,
      }),
    ];
    const s = new Session(compile(p), true);
    await s.command(direction);
    expect(s.state.location).toBe('courtyard');
  },
);
it('uses known destination names independently of internal exit names and rejects nonadjacent destinations', async () => {
  const p = localAdventure();
  p.objects = p.objects.filter((o) => o.id !== 'door');
  p.connections = [
    connectionSchema.parse({ id: 'exit', name: 'WaitToCourt', from: p.start, to: 'courtyard' }),
  ];
  const s = new Session(compile(p), true);
  await s.command('go to courtyard');
  expect(s.state.location).toBe('courtyard');
  await s.command('go to maintenance room');
  expect(s.state.location).toBe('courtyard');
  expect(s.state.turn).toBe(1);
});
it('keeps a secret destination unnameable until it becomes public', async () => {
  const p = localAdventure();
  p.connections[0].revealDestination = false;
  const s = new Session(compile(p), true);
  await s.command('go to courtyard');
  expect(s.last).toBeNull();
  expect(s.state.turn).toBe(0);
});
it('repeats a direction from the new room and restores the selector on undo', async () => {
  const p = localAdventure();
  p.objects = p.objects.filter((o) => o.id !== 'door');
  p.locations.push({ ...p.locations[0], id: 'end', name: 'End' });
  p.connections = [
    connectionSchema.parse({
      id: 'one',
      name: 'First',
      direction: 'north',
      from: p.start,
      to: 'courtyard',
    }),
    connectionSchema.parse({
      id: 'two',
      name: 'Second',
      direction: 'north',
      from: 'courtyard',
      to: 'end',
    }),
  ];
  const s = new Session(compile(p), true);
  await s.command('north');
  await s.command('again');
  expect(s.state.location).toBe('end');
  s.undo();
  await s.command('g');
  expect(s.state.location).toBe('end');
});
it('keeps supported contents visible when the opaque interior is closed', () => {
  const p = blankProject();
  p.objects = [
    objectSchema.parse({
      id: 'box',
      name: 'Box',
      capabilities: ['container', 'supporter', 'openable'],
      placement: { kind: 'location', id: p.start },
    }),
    objectSchema.parse({ id: 'in', name: 'Inside', placement: { kind: 'inside', id: 'box' } }),
    objectSchema.parse({ id: 'on', name: 'On top', placement: { kind: 'on', id: 'box' } }),
  ];
  const s = startGame(p).state;
  expect(scope(p, s, 'in').visible).toBe(false);
  expect(scope(p, s, 'on').visible).toBe(true);
});
it('blocks light and tools across an opaque closed boundary', () => {
  const p = blankProject();
  p.locations[0].dark = true;
  p.objects = [
    objectSchema.parse({
      id: 'bag',
      name: 'Bag',
      capabilities: ['container', 'openable'],
      placement: { kind: 'player' },
    }),
    objectSchema.parse({
      id: 'lamp',
      name: 'Lamp',
      capabilities: ['light'],
      active: true,
      placement: { kind: 'inside', id: 'bag' },
    }),
  ];
  const s = startGame(p).state;
  expect(illuminated(p, s)).toBe(false);
  expect(scope(p, s, 'lamp').accessible).toBe(false);
  s.objects.bag.open = true;
  expect(illuminated(p, s)).toBe(true);
  expect(scope(p, s, 'lamp').accessible).toBe(true);
});
it('moves an occupied enclosure without losing the actor or effective room', async () => {
  const p = localAdventure();
  p.objects.push(
    objectSchema.parse({
      id: 'crate',
      name: 'Crate',
      capabilities: ['container', 'enterable'],
      placement: { kind: 'location', id: p.start },
    }),
  );
  p.rules.push(
    ruleSchema.parse({
      id: 'move-crate',
      name: 'Move crate',
      trigger: 'wait',
      effects: [effect('move', { ref: 'crate', placement: { kind: 'location', id: 'courtyard' } })],
    }),
  );
  const s = new Session(compile(p), true);
  await s.command('enter crate');
  await s.command('wait');
  expect(s.state.location).toBe('courtyard');
  expect(s.state.playerPlacement.id).toBe('crate');
  await s.command('out');
  expect(s.state.playerPlacement).toEqual({ kind: 'location', id: 'courtyard' });
});
it('mutates typed NPC properties and preserves them in portable saves', async () => {
  const p = localAdventure();
  p.propertyDefinitions.push(
    variableSchema.parse({ id: 'mood', name: 'Mood', type: 'number', initial: 0, min: 0, max: 5 }),
  );
  p.rules.push(
    ruleSchema.parse({
      id: 'change',
      name: 'Change mood',
      trigger: 'wait',
      effects: [effect('property', { ref: 'caretaker', key: 'mood', value: 3 })],
    }),
  );
  const s = new Session(compile(p), true);
  await s.command('wait');
  const copy = new Session(s.game, false);
  copy.restore(s.save());
  expect(copy.state.characterProperties.caretaker.mood).toBe(3);
  s.undo();
  expect(s.state.characterProperties.caretaker.mood).toBe(0);
});
it('preserves state and pending work when restore validation fails', async () => {
  const s = session();
  await s.command('take key; unlock drawer; open drawer');
  const before = s.save();
  expect(() => s.restore({ ...before, hash: 'wrong' })).toThrow();
  expect(s.save()).toEqual(before);
  expect(() => readSave({ ...before, schemaVersion: 1 }, s.game)).toThrow(
    'Unsupported save version',
  );
});
it('processes due instances in stable insertion order and stops time at an ending', () => {
  const p = blankProject();
  p.actions.push(
    actionSchema.parse({
      id: 'long',
      name: 'Long',
      turnCost: 3,
      forms: [{ id: 'long-form', parts: formParts('long') }],
    }),
  );
  p.rules = [
    ruleSchema.parse({ id: 'long-handler', name: 'Long', trigger: 'long', effects: [] }),
    ruleSchema.parse({
      id: 'tick',
      name: 'Tick',
      phase: 'event',
      trigger: 'turn',
      condition: { kind: 'compare', source: 'turn', ref: '', key: '', op: 'eq', value: 2 },
      effects: [effect('end', { ref: 'done', text: 'Finished.' })],
    }),
  ];
  const r = execute(p, startGame(p).state, { actionId: 'long', args: {} });
  expect(r.state.turn).toBe(2);
  expect(r.state.ending).toBe('done');
});
it('counts expected clarification and refusal as successful scenario assertions', async () => {
  const result = await runScenario(
    localAdventure(),
    scenarioSchema.parse({
      id: 'test',
      name: 'Questions',
      commands: ['unlock drawer', 'cancel', 'open drawer'],
      assertions: [
        { step: 0, kind: 'question', value: 'missing' },
        { step: 1, kind: 'turn', value: 0 },
        { step: 2, kind: 'refusal' },
      ],
    }),
  );
  expect(result.passed).toBe(true);
  expect(result.steps).toHaveLength(3);
});
it('migrates the version-one sample with stable IDs, text, positions and playable speech', async () => {
  const raw = JSON.parse(await readFile('tests/fixtures/legacy-v1.elsewhen.json', 'utf8')),
    before = JSON.stringify(raw),
    p = migrateProject(raw);
  expect(p.schemaVersion).toBe(2);
  expect(
    p.locations.map((l) => ({ id: l.id, description: l.description, position: l.position })),
  ).toEqual(
    raw.locations.map((l: { id: string; description: string; position: number[] }) => ({
      id: l.id,
      description: l.description,
      position: l.position,
    })),
  );
  expect(JSON.stringify(raw)).toBe(before);
  const s = new Session(compile(p), true);
  for (const input of walkthrough) await s.command(input);
  expect(s.state.ending).toBe('homeward');
});

import { expect, it } from 'vitest';
import {
  blankProject,
  effect,
  objectSchema,
  ruleSchema,
  templateSchema,
  variableSchema,
  characterSchema,
  connectionSchema,
} from '../packages/domain/src/index';
import { compile } from '../packages/compiler/src/index';
import { execute, startGame } from '../packages/engine/src/index';
import { Session } from '../apps/desktop/src/main/session';

it('check rules stop handlers and after rules without changing world state', () => {
  const p = blankProject();
  p.rules = [
    ruleSchema.parse({
      id: 'guard',
      name: 'Never allow',
      phase: 'check',
      trigger: 'wait',
      condition: { kind: 'any', conditions: [] },
      otherwise: 'Not yet.',
    }),
    ruleSchema.parse({
      id: 'handler',
      name: 'Outcome',
      trigger: 'wait',
      effects: [effect('print', { text: 'must not print' })],
    }),
    ruleSchema.parse({
      id: 'after',
      name: 'After',
      phase: 'after',
      trigger: 'wait',
      effects: [effect('end', { ref: 'bad' })],
    }),
  ];
  const before = startGame(p).state,
    result = execute(p, before, { actionId: 'wait', args: {} });
  expect(result.success).toBe(false);
  expect(result.output).toEqual(['Not yet.']);
  expect(result.state.ending).toBeNull();
  expect(result.state.turn).toBe(1);
  p.failedAttemptsCostTurn = false;
  expect(execute(p, before, { actionId: 'wait', args: {} }).state.turn).toBe(0);
});

it('uses one highest-priority handler, ordered after rules, and terminates at an ending', () => {
  const p = blankProject();
  p.rules = [
    ruleSchema.parse({
      id: 'low',
      name: 'Low',
      trigger: 'wait',
      priority: 0,
      effects: [effect('print', { text: 'low' })],
    }),
    ruleSchema.parse({
      id: 'high',
      name: 'High',
      trigger: 'wait',
      priority: 10,
      effects: [effect('print', { text: 'high' })],
    }),
    ruleSchema.parse({
      id: 'after',
      name: 'After',
      trigger: 'wait',
      phase: 'after',
      effects: [
        effect('end', { text: 'finish', ref: 'done' }),
        effect('print', { text: 'too late' }),
      ],
    }),
  ];
  const result = execute(p, startGame(p).state, { actionId: 'wait', args: {} });
  expect(result.output).toEqual(['high', 'finish']);
  expect(result.state.ending).toBe('done');
});

it('rolls back an unbounded event cycle', () => {
  const p = blankProject();
  p.rules = [
    ruleSchema.parse({
      id: 'init',
      name: 'Start cycle',
      trigger: 'wait',
      effects: [effect('emit', { ref: 'loop' })],
    }),
    ruleSchema.parse({
      id: 'loop',
      name: 'Loop',
      phase: 'event',
      trigger: 'loop',
      effects: [effect('emit', { ref: 'loop' })],
    }),
  ];
  const before = startGame(p).state,
    result = execute(p, before, { actionId: 'wait', args: {} });
  expect(result.committed).toBe(false);
  expect(result.error).toContain('work limit');
  expect(result.state).toBe(before);
});

it('keeps forgotten topics suppressed until explicitly revealed again', () => {
  const p = blankProject();
  p.characters = [
    characterSchema.parse({
      id: 'guide',
      name: 'Guide',
      location: p.start,
      topics: [{ id: 'topic', name: 'History', known: true }],
    }),
  ];
  p.rules = [
    ruleSchema.parse({
      id: 'forget',
      name: 'Forget',
      trigger: 'wait',
      effects: [effect('forgetTopic', { ref: 'topic' })],
    }),
    ruleSchema.parse({
      id: 'reveal',
      name: 'Reveal',
      trigger: 'look',
      effects: [effect('reveal', { ref: 'topic' })],
    }),
  ];
  let s = startGame(p).state;
  expect(s.known).toContain('topic');
  s = execute(p, s, { actionId: 'wait', args: {} }).state;
  expect(s.known).not.toContain('topic');
  s = execute(p, s, { actionId: 'inventory', args: {} }).state;
  expect(s.known).not.toContain('topic');
  s = execute(p, s, { actionId: 'look', args: {} }).state;
  expect(s.known).toContain('topic');
});

it('inherits child property defaults and rolls back invalid typed property effects', () => {
  const p = blankProject();
  const prop = variableSchema.parse({
    id: 'charge',
    name: 'Charge',
    type: 'number',
    min: 0,
    max: 5,
    initial: 1,
  });
  p.templates = [
    templateSchema.parse({ id: 'base', name: 'Base', properties: [prop] }),
    templateSchema.parse({
      id: 'child',
      name: 'Child',
      parent: 'base',
      properties: [{ ...prop, initial: 3 }],
    }),
  ];
  p.objects = [
    objectSchema.parse({
      id: 'orb',
      name: 'Orb',
      template: 'child',
      placement: { kind: 'location', id: p.start },
    }),
  ];
  p.rules = [
    ruleSchema.parse({
      id: 'overcharge',
      name: 'Overcharge',
      trigger: 'wait',
      effects: [effect('property', { ref: 'orb', key: 'charge', value: 100 })],
    }),
  ];
  const game = compile(p),
    before = startGame(game.project).state;
  expect(before.objects.orb.properties.charge).toBe(3);
  const result = execute(game.project, before, { actionId: 'wait', args: {} });
  expect(result.committed).toBe(false);
  expect(result.state.objects.orb.properties.charge).toBe(3);
});

it('respects an explicit take source and lets a player remove an item from a carried bag', async () => {
  const p = blankProject();
  p.objects = [
    objectSchema.parse({
      id: 'bag',
      name: 'Bag',
      capabilities: ['portable', 'container'],
      placement: { kind: 'player', id: '' },
    }),
    objectSchema.parse({
      id: 'box',
      name: 'Box',
      capabilities: ['container'],
      placement: { kind: 'location', id: p.start },
    }),
    objectSchema.parse({
      id: 'gem',
      name: 'Gem',
      placement: { kind: 'inside', id: 'bag' },
      capabilities: ['portable'],
    }),
  ];
  const s = new Session(compile(p), true);
  await s.command('take gem from box');
  expect(s.last?.success).toBe(false);
  expect(s.state.placements.gem.id).toBe('bag');
  await s.command('take gem from bag');
  expect(s.last?.success).toBe(true);
  expect(s.state.placements.gem.kind).toBe('player');
});

it('validates capacity and containment for authored movement effects', () => {
  const p = blankProject();
  p.objects = [
    objectSchema.parse({
      id: 'box',
      name: 'Box',
      capacity: 0,
      capabilities: ['container'],
      placement: { kind: 'location', id: p.start },
    }),
    objectSchema.parse({ id: 'gem', name: 'Gem', placement: { kind: 'player', id: '' } }),
  ];
  p.rules = [
    ruleSchema.parse({
      id: 'move',
      name: 'Move',
      trigger: 'wait',
      effects: [effect('move', { ref: 'gem', placement: { kind: 'inside', id: 'box' } })],
    }),
  ];
  const before = startGame(p).state,
    result = execute(p, before, { actionId: 'wait', args: {} });
  expect(result.committed).toBe(false);
  expect(result.error).toContain('Capacity');
  expect(result.state.placements.gem.kind).toBe('player');
});

it('debug edits are undoable and never alter the compiled source', () => {
  const s = new Session(compile(blankProject()), true),
    original = JSON.stringify(s.game);
  s.debugChange({ kind: 'revealMap', ref: '', value: null });
  expect(s.view().modified).toBe(true);
  s.undo();
  expect(JSON.stringify(s.game)).toBe(original);
  expect(() =>
    new Session(s.game, false).debugChange({ kind: 'revealMap', ref: '', value: null }),
  ).toThrow();
});

it('map travel uses an exact outgoing exit and still executes authored checks', () => {
  const p = blankProject();
  p.locations.push({ ...p.locations[0], id: 'other', name: 'Other' });
  p.connections.push(
    connectionSchema.parse({ id: 'first', name: 'Door', from: p.start, to: 'other' }),
    connectionSchema.parse({
      id: 'second',
      name: 'Door',
      from: p.start,
      to: 'other',
      enabled: false,
    }),
  );
  const s = new Session(compile(p), false);
  s.travel('second');
  expect(s.last?.success).toBe(false);
  expect(s.state.location).toBe(p.start);
  s.travel('first');
  expect(s.state.location).toBe('other');
  expect(() => s.travel('first')).toThrow('visible exit');
  s.undo();
  expect(s.state.location).toBe(p.start);
});

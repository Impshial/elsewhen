import { describe, it, expect } from 'vitest';
import {
  blankProject,
  objectSchema,
  connectionSchema,
  ruleSchema,
  actionSchema,
  variableSchema,
  effect,
  characterSchema,
  templateSchema,
} from '../packages/domain/src/index';
import { startGame, execute, scope, illuminated } from '../packages/engine/src/index';
import { compile } from '../packages/compiler/src/index';
const fixture = () => {
  const p = blankProject();
  p.failedAttemptsCostTurn = false;
  return p;
};
describe('local action transactions', () => {
  it('uses Open requirements for implicit doors and rolls back a failed parent', () => {
    const p = fixture();
    p.locations.push({ ...p.locations[0], id: 'other', name: 'Courtyard' });
    p.connections.push(
      connectionSchema.parse({
        id: 'north',
        name: 'Arch',
        from: p.start,
        to: 'other',
        doorId: 'door',
        direction: 'north',
      }),
    );
    p.objects.push(
      objectSchema.parse({
        id: 'door',
        name: 'Door',
        placement: { kind: 'connection', id: 'north' },
        capabilities: ['door', 'openable'],
      }),
    );
    p.rules.push(
      ruleSchema.parse({
        id: 'guard',
        name: 'Blocked opening',
        phase: 'check',
        trigger: 'open',
        otherwise: 'The latch resists.',
        condition: { kind: 'any', conditions: [] },
      }),
    );
    const s = startGame(p).state,
      r = execute(p, s, { actionId: 'go', args: { exit: 'north' } });
    expect(r.success).toBe(false);
    expect(r.output).toEqual(['The latch resists.']);
    expect(r.state.objects.door.open).toBe(false);
    expect(r.state.location).toBe(p.start);
    p.rules = [
      ruleSchema.parse({
        id: 'noop',
        name: 'Pretend to open',
        trigger: 'open',
        effects: [effect('print', { text: 'A trick!' })],
      }),
    ];
    const refused = execute(p, s, { actionId: 'go', args: { exit: 'north' } });
    expect(refused.success).toBe(false);
    expect(refused.output).toEqual(['The door is still closed.']);
  });
  it('changes the report without replacing the standard operation', () => {
    const p = fixture();
    p.objects.push(
      objectSchema.parse({
        id: 'drawer',
        name: 'Drawer',
        placement: { kind: 'location', id: p.start },
        capabilities: ['openable', 'container'],
      }),
    );
    p.rules.push(
      ruleSchema.parse({
        id: 'report',
        name: 'Opening response',
        phase: 'response',
        trigger: 'open',
        effects: [effect('print', { text: 'The drawer slides softly.' })],
      }),
    );
    const r = execute(p, startGame(p).state, { actionId: 'open', args: { target: 'drawer' } });
    expect(r.success).toBe(true);
    expect(r.state.objects.drawer.open).toBe(true);
    expect(r.output).toEqual(['The drawer slides softly.']);
  });
  it('advances each turn of a costly action, including turn events', () => {
    const p = fixture();
    p.variables.push(
      variableSchema.parse({ id: 'ticks', name: 'Ticks', type: 'number', initial: 0 }),
    );
    p.actions.push(actionSchema.parse({ id: 'long', name: 'Long wait', turnCost: 3 }));
    p.rules.push(
      ruleSchema.parse({ id: 'long-handler', name: 'Wait', trigger: 'long', effects: [] }),
      ruleSchema.parse({
        id: 'ticks-event',
        name: 'Clock',
        phase: 'event',
        trigger: 'turn',
        effects: [effect('increment', { ref: 'ticks', value: 1 })],
      }),
    );
    const r = execute(p, startGame(p).state, { actionId: 'long', args: {} });
    expect(r.state.turn).toBe(3);
    expect(r.state.variables.ticks).toBe(3);
  });
  it('invokes normal actions without extra turns and rolls back refused child actions', () => {
    const p = fixture();
    p.objects.push(
      objectSchema.parse({
        id: 'drawer',
        name: 'Drawer',
        placement: { kind: 'location', id: p.start },
        capabilities: ['container', 'openable'],
        locked: true,
      }),
    );
    p.rules.push(
      ruleSchema.parse({
        id: 'invoke',
        name: 'Try opening',
        trigger: 'wait',
        effects: [
          effect('invoke', { ref: 'open', arguments: { target: 'drawer' }, onRefusal: 'report' }),
          effect('print', { text: 'Still waiting.' }),
        ],
      }),
    );
    const r = execute(p, startGame(p).state, { actionId: 'wait', args: {} });
    expect(r.success).toBe(true);
    expect(r.state.turn).toBe(1);
    expect(r.output).toEqual(['It is locked.', 'Still waiting.']);
    expect(r.state.objects.drawer.open).toBe(false);
  });
  it('distinguishes inside from on for a closed dual-capability object', () => {
    const p = fixture();
    p.objects.push(
      objectSchema.parse({
        id: 'desk',
        name: 'Desk',
        placement: { kind: 'location', id: p.start },
        capabilities: ['container', 'supporter', 'openable'],
      }),
      objectSchema.parse({
        id: 'key',
        name: 'Key',
        placement: { kind: 'player' },
        capabilities: ['portable'],
      }),
    );
    const s = startGame(p).state;
    expect(
      execute(p, s, { actionId: 'putInside', args: { item: 'key', destination: 'desk' } }).success,
    ).toBe(false);
    const r = execute(p, s, { actionId: 'putOn', args: { item: 'key', destination: 'desk' } });
    expect(r.success).toBe(true);
    expect(r.state.placements.key).toEqual({ kind: 'on', id: 'desk' });
  });
  it('consumes an edible item without deleting its authored entity', () => {
    const p = fixture();
    p.objects.push(
      objectSchema.parse({
        id: 'apple',
        name: 'Apple',
        capabilities: ['portable', 'edible'],
        placement: { kind: 'location', id: p.start },
      }),
    );
    const s = startGame(p).state,
      r = execute(p, s, { actionId: 'eat', args: { target: 'apple' } });
    expect(r.success).toBe(true);
    expect(r.state.consumed).toEqual(['apple']);
    expect(p.objects).toHaveLength(1);
    expect(s.consumed).toEqual([]);
  });
  it('honors NPC possession visibility and taking permission', () => {
    const p = fixture();
    p.characters.push(characterSchema.parse({ id: 'ada', name: 'Ada', location: p.start }));
    p.objects.push(
      objectSchema.parse({
        id: 'key',
        name: 'Key',
        placement: { kind: 'character', id: 'ada' },
        capabilities: ['portable'],
      }),
    );
    const s = startGame(p).state;
    expect(scope(p, s, 'key').visible).toBe(true);
    expect(execute(p, s, { actionId: 'take', args: { item: 'key' } }).output[0]).toContain(
      'permission',
    );
  });
  it('uses the occupied enclosure as the viewpoint for light and reachability', () => {
    const p = fixture();
    p.objects.push(
      objectSchema.parse({
        id: 'box',
        name: 'Box',
        capabilities: ['container', 'openable', 'enterable'],
        open: true,
        placement: { kind: 'location', id: p.start },
      }),
      objectSchema.parse({
        id: 'lamp',
        name: 'Lamp',
        capabilities: ['light', 'switchable'],
        active: true,
        placement: { kind: 'inside', id: 'box' },
      }),
    );
    const r = execute(p, startGame(p).state, { actionId: 'enter', args: { target: 'box' } });
    expect(r.success).toBe(true);
    r.state.objects.box.open = false;
    expect(illuminated(p, r.state)).toBe(true);
    expect(scope(p, r.state, 'lamp').reachable).toBe(true);
    r.state.objects.lamp.active = false;
    expect(illuminated(p, r.state)).toBe(false);
  });
  it('resolves template capabilities before validating placement', () => {
    const p = fixture();
    p.templates.push(
      templateSchema.parse({ id: 'box-type', name: 'Boxes', capabilities: ['container'] }),
    );
    p.objects.push(
      objectSchema.parse({
        id: 'box',
        name: 'Box',
        template: 'box-type',
        placement: { kind: 'location', id: p.start },
      }),
      objectSchema.parse({ id: 'key', name: 'Key', placement: { kind: 'inside', id: 'box' } }),
    );
    expect(compile(p).project.objects[0].capabilities).toContain('container');
  });
});

import { describe, it, expect } from 'vitest';
import { foldedHorizon, walkthrough } from '../examples/the-folded-horizon/sample';
import { compile, validateProject } from '../packages/compiler/src/index';
import { execute, startGame, projectPlayer, scope } from '../packages/engine/src/index';
import { buildContext, interpret } from '../packages/parser/src/index';
import { effect, always } from '../packages/domain/src/index';
import { Session } from '../apps/desktop/src/main/session';
describe('The Folded Horizon', () => {
  it('validates and completes the authored conventional walkthrough', async () => {
    expect(validateProject(foldedHorizon()).filter((i) => i.severity === 'error')).toEqual([]);
    const session = new Session(compile(foldedHorizon()), true);
    for (const command of walkthrough) {
      await session.command(command);
      expect(
        session.last?.success,
        command + ': ' + session.last?.error + ' ' + session.last?.output.join(' '),
      ).toBe(true);
    }
    expect(session.state.ending).toBe('homeward');
    expect(session.state.turn).toBe(17);
  });
  it('does not leak the hidden token, destinations, notes or solution into initial context', () => {
    const p = foldedHorizon(),
      s = startGame(p).state,
      ctx = JSON.stringify(buildContext(projectPlayer(p, s)));
    for (const hidden of ['Meridian', 'obj-token', 'loc-echo', 'keyId', 'rule-activate', 'Dormant'])
      expect(ctx).not.toContain(hidden);
    expect(JSON.stringify(projectPlayer(p, s).nodes)).not.toContain('Crystal Cavern');
  });
  it('distinguishes opaque, transparent, closed, and open containment', () => {
    const p = foldedHorizon(),
      s = startGame(p).state;
    s.location = 'loc-gate';
    expect(scope(p, s, 'obj-token').visible).toBe(false);
    p.objects.find((o) => o.id === 'obj-case')!.transparent = true;
    expect(scope(p, s, 'obj-token').visible).toBe(true);
    expect(scope(p, s, 'obj-token').reachable).toBe(false);
    s.objects['obj-case'].open = true;
    expect(scope(p, s, 'obj-token').reachable).toBe(true);
  });
  it('rolls back output, state, events and turn on an internal effect failure', () => {
    const p = foldedHorizon();
    p.rules.push({
      ...p.rules[0],
      id: 'broken',
      trigger: 'wait',
      bindings: {},
      condition: always(),
      effects: [
        effect('print', { text: 'must not leak' }),
        effect('set', { ref: 'var-wormhole', value: 'Active' }),
        effect('set', { ref: 'absent', value: true }),
      ],
    });
    const s = startGame(p).state,
      r = execute(p, s, { actionId: 'wait', args: {} });
    expect(r.committed).toBe(false);
    expect(r.state).toBe(s);
    expect(r.output).toEqual([]);
    expect(r.state.variables['var-wormhole']).toBe('Dormant');
  });
  it('keeps ambiguity pending and resolves it without extra turns', async () => {
    const session = new Session(compile(foldedHorizon()), true);
    for (const command of walkthrough.slice(0, 10)) await session.command(command);
    const turn = session.state.turn;
    await session.command('read book');
    expect(session.pending?.candidates).toHaveLength(2);
    expect(session.state.turn).toBe(turn);
    await session.command('blue');
    expect(session.pending).toBeNull();
    expect(session.transcript.at(-1)?.text).toContain('A door can remember');
    expect(session.state.turn).toBe(turn);
  });
  it('undo and redo restore state, transcript and discovery exactly', async () => {
    const session = new Session(compile(foldedHorizon()), true),
      initial = session.save();
    await session.command('take lantern');
    const after = session.save();
    session.undo();
    expect(session.save()).toEqual(initial);
    session.redo();
    expect(session.save()).toEqual(after);
  });
  it('schedules delay one on the next consumed turn, not the scheduling turn', () => {
    const p = foldedHorizon();
    p.rules.push(
      {
        ...p.rules[0],
        id: 'schedule',
        trigger: 'wait',
        bindings: {},
        condition: always(),
        once: true,
        effects: [effect('schedule', { ref: 'arrival', delay: 1 })],
      },
      {
        ...p.rules[0],
        id: 'arrival',
        phase: 'event',
        trigger: 'scheduled',
        bindings: {},
        condition: always(),
        effects: [effect('print', { text: 'arrived' })],
      },
    );
    let s = startGame(p).state;
    let r = execute(p, s, { actionId: 'wait', args: {} });
    expect(r.output).not.toContain('arrived');
    s = r.state;
    r = execute(p, s, { actionId: 'look', args: {} });
    expect(r.output).not.toContain('arrived');
    r = execute(p, r.state, { actionId: 'wait', args: {} });
    expect(r.output).toContain('arrived');
  });
  it('map proximity cannot create an exit', () => {
    const p = foldedHorizon();
    p.locations.forEach((l) => (l.position = [0, 0, 0]));
    const s = startGame(p).state;
    const r = execute(p, s, { actionId: 'go', args: { exit: 'loc-shore' } });
    expect(r.committed).toBe(false);
    expect(r.state.location).toBe('loc-nexus');
  });
  it('keeps tool and target roles distinct', () => {
    const p = foldedHorizon(),
      s = startGame(p).state;
    s.known.push('obj-shard');
    s.observations['obj-shard'] = {
      id: 'obj-shard',
      name: 'Resonance Shard',
      aliases: ['shard'],
      description: '',
      kind: 'object',
      capabilities: ['portable'],
    };
    const r = interpret('use shard on anchor', buildContext(projectPlayer(p, s)));
    expect(r.kind).toBe('resolved');
    if (r.kind === 'resolved')
      expect(r.actions[0].args).toEqual({ item: 'obj-shard', target: 'obj-anchor' });
  });
});

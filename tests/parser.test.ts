import { describe, it, expect } from 'vitest';
import { buildContext, interpret, splitCommands, lex } from '../packages/parser/src/index';
import { compile } from '../packages/compiler/src/index';
import { projectPlayer, startGame } from '../packages/engine/src/index';
import { Session } from '../apps/desktop/src/main/session';
import { localAdventure, localWalkthrough } from '../examples/local-adventure/sample';
import { objectSchema, connectionSchema } from '../packages/domain/src/index';
const setup = () => new Session(compile(localAdventure()), true);
describe('local grammar and discourse', () => {
  it('completes the drawer, door, conversation and custom verb walkthrough', async () => {
    const s = setup();
    for (const command of localWalkthrough) {
      await s.command(command);
      expect(s.last?.success, command + ' ' + s.transcript.at(-1)?.text).toBe(true);
    }
    expect(s.state.variables.rang).toBe(true);
    expect(s.state.location).toBe('courtyard');
  });
  it('consumes every significant noun token', async () => {
    const s = setup();
    await s.command('take brass key banana');
    expect(s.state.turn).toBe(0);
    expect(s.state.placements.key.kind).toBe('location');
  });
  it('retains bindings and object focus while completing a missing instrument', async () => {
    const s = setup();
    await s.command('take key');
    await s.command('unlock drawer');
    expect(s.pending?.kind).toBe('missing');
    expect(s.pending?.command.bindings.target).toBe('drawer');
    await s.command('brass key');
    expect(s.pending).toBeNull();
    expect(s.state.objects.drawer.locked).toBe(false);
    await s.command('open it');
    expect(s.state.objects.drawer.open).toBe(true);
  });
  it('replaces a question with a fresh command', async () => {
    const s = setup();
    await s.command('unlock drawer');
    await s.command('examine lamp');
    expect(s.pending).toBeNull();
    expect(s.last?.action.actionId).toBe('examine');
  });
  it('validates lexical structure and queue limits before executing', async () => {
    const s = setup();
    await s.command('take key; say "unfinished');
    expect(s.state.turn).toBe(0);
    await s.command(Array(33).fill('wait').join(';'));
    expect(s.state.turn).toBe(0);
    expect(() => lex('say "bad \\q"')).toThrow();
    expect(splitCommands('say "wait; then go north" to caretaker; look')).toHaveLength(2);
  });
  it('resolves later clauses against fresh state', async () => {
    const s = setup();
    await s.command('take key then unlock drawer with key then open drawer then take photograph');
    expect(s.state.placements.photo.kind).toBe('player');
    expect(s.state.turn).toBe(4);
  });
  it('resumes suspended clauses after answering', async () => {
    const s = setup();
    await s.command('take key; unlock drawer; open drawer; take photograph');
    expect(s.remainder).toHaveLength(2);
    await s.command('key');
    expect(s.state.placements.photo.kind).toBe('player');
  });
  it('binds numeric duplicate-name choices directly to IDs', async () => {
    const p = localAdventure();
    p.objects.push(
      objectSchema.parse({
        id: 'key-2',
        name: 'Brass Key',
        placement: { kind: 'location', id: p.start },
        capabilities: ['portable'],
      }),
    );
    const s = new Session(compile(p), true);
    await s.command('take brass key');
    expect(s.pending?.candidates).toHaveLength(2);
    const chosen = s.pending!.candidates[1].id;
    await s.command('2');
    expect(s.state.placements[chosen].kind).toBe('player');
    expect(s.state.turn).toBe(1);
  });
  it('keeps hidden identities private without truncating public vocabulary', () => {
    const p = localAdventure();
    for (let n = 0; n < 180; n++)
      p.objects.push(
        objectSchema.parse({
          id: 'item-' + n,
          name: 'Marker ' + n,
          placement: { kind: 'location', id: p.start },
          capabilities: ['portable'],
        }),
      );
    const ctx = buildContext(projectPlayer(p, startGame(p).state));
    expect(JSON.stringify(ctx)).not.toContain('photo-topic');
    const r = interpret('take marker 179', ctx);
    expect(r.kind).toBe('resolved');
    if (r.kind === 'resolved') expect(r.actions[0].args.item).toBe('item-179');
  });
  it('identifies impossible targets for engine refusals', async () => {
    const s = setup();
    await s.command('take desk');
    expect(s.last?.output[0]).toContain('fixed');
    await s.command('take coin');
    expect(s.last?.success).toBe(false);
    expect(s.state.placements.coin.id).toBe('case');
  });
  it('continues explicit lists through ordinary member refusals', async () => {
    const s = setup();
    await s.command('take desk and key');
    expect(s.state.placements.key.kind).toBe('player');
    expect(s.state.turn).toBe(1);
    expect(s.discourse.plural).toEqual(['desk', 'key']);
  });
  it('validates a distinct quantity subset before taking any member', async () => {
    const p = localAdventure();
    p.objects = p.objects.filter((o) => o.id !== 'coin');
    for (let i = 0; i < 3; i++)
      p.objects.push(
        objectSchema.parse({
          id: 'coin-' + i,
          name: ['Brass Coin', 'Silver Coin', 'Copper Coin'][i],
          plurals: ['coins'],
          capabilities: ['portable'],
          placement: { kind: 'location', id: p.start },
        }),
      );
    const s = new Session(compile(p), true);
    await s.command('take two coins');
    expect(s.pending?.kind).toBe('quantity');
    await s.command('1 and 1');
    expect(s.state.turn).toBe(0);
    expect(s.pending).not.toBeNull();
    await s.command('1 and 3');
    expect(s.pending).toBeNull();
    expect(s.state.turn).toBe(2);
    expect(s.discourse.plural).toEqual(['coin-0', 'coin-2']);
  });
  it('protects entity names containing conjunctions', async () => {
    const p = localAdventure();
    p.objects.push(
      objectSchema.parse({
        id: 'salt',
        name: 'Salt and Pepper',
        capabilities: ['portable'],
        placement: { kind: 'location', id: p.start },
      }),
    );
    const s = new Session(compile(p), true);
    await s.command('take Salt and Pepper');
    expect(s.state.placements.salt.kind).toBe('player');
  });
  it('asks about duplicate directions without testing puzzle success', async () => {
    const p = localAdventure();
    p.connections.push(
      connectionSchema.parse({
        id: 'north2',
        name: 'Other passage',
        direction: 'north',
        from: p.start,
        to: 'courtyard',
        enabled: false,
      }),
    );
    const s = new Session(compile(p), true);
    await s.command('north');
    expect(s.pending?.candidates).toHaveLength(2);
    expect(s.state.turn).toBe(0);
  });
  it('restores a saved pending question and queue without executing them', async () => {
    const s = setup();
    await s.command('take key; unlock drawer; open drawer');
    const saved = s.save();
    const other = setup();
    other.restore(saved);
    expect(other.state.turn).toBe(1);
    expect(other.pending?.kind).toBe('missing');
    await other.command('key');
    expect(other.state.objects.drawer.open).toBe(true);
  });
  it('cancels questions on undo without resurrecting them on redo', async () => {
    const s = setup();
    await s.command('take key');
    await s.command('unlock drawer');
    s.undo();
    expect(s.pending).toBeNull();
    s.redo();
    expect(s.pending).toBeNull();
    expect(s.state.placements.key.kind).toBe('player');
  });
});

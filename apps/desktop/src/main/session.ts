import {
  clone,
  type GameState,
  type TranscriptEntry,
  type ActionResult,
  type Scalar,
  type CanonicalAction,
} from '../../../../packages/domain/src/index';
import { type CompiledGame } from '../../../../packages/compiler/src/index';
import {
  execute,
  startGame,
  projectPlayer,
  refreshKnowledge,
  assertState,
  diff,
} from '../../../../packages/engine/src/index';
import {
  buildContext,
  interpret,
  clarificationText,
  splitCommands,
  isCommand,
  emptyDiscourse,
  type Clarification,
  type ParserContext,
  type Resolution,
} from '../../../../packages/parser/src/index';
import { type Discourse } from '../../../../packages/domain/src/conversation';
import { readSave, type SaveData } from '../../../../packages/persistence/src/index';
type Checkpoint = { state: GameState; transcript: TranscriptEntry[]; discourse: Discourse };
export class Session {
  readonly id = crypto.randomUUID();
  epoch = 0;
  revision = 0;
  state: GameState;
  transcript: TranscriptEntry[];
  discourse: Discourse = emptyDiscourse();
  pending: Clarification | null = null;
  remainder: string[] = [];
  last: ActionResult | null = null;
  context: ParserContext | null = null;
  source = 'local grammar';
  busy = false;
  detached = false;
  showCommandHints = true;
  presentation = {
    input: '',
    history: [] as string[],
    historyIndex: 0,
    selected: '',
    inventoryId: '',
    fontSize: 19,
    follow: true,
    search: '',
    scrollTop: 0,
  };
  interpretation: Resolution | null = null;
  private past: Checkpoint[] = [];
  private future: Checkpoint[] = [];
  constructor(
    readonly game: CompiledGame,
    readonly debug: boolean,
  ) {
    const initial = startGame(game.project);
    this.state = initial.state;
    this.transcript = initial.output.map((text) => ({ kind: 'narration', text }));
  }
  modified = false;

  debugChange(change: {
    kind: 'teleport' | 'grant' | 'variable' | 'revealMap';
    ref: string;
    value: Scalar;
  }) {
    if (!this.debug) throw new Error('Debug controls are available only in designer playtests.');
    this.cancel();
    const before = this.checkpoint(),
      draft = clone(this.state),
      p = this.game.project;
    if (change.kind === 'teleport') {
      if (!p.locations.some((l) => l.id === change.ref)) throw new Error('Unknown location.');
      draft.previousLocation = draft.location;
      draft.location = change.ref;
      draft.playerPlacement = { kind: 'location', id: change.ref };
    }
    if (change.kind === 'grant') {
      const o = p.objects.find((o) => o.id === change.ref);
      if (!o || o.capabilities.includes('door')) throw new Error('Choose an ordinary object.');
      draft.placements[o.id] = { kind: 'player', id: '' };
      draft.objects[o.id].concealed = false;
    }
    if (change.kind === 'variable') {
      if (!p.variables.some((v) => v.id === change.ref)) throw new Error('Unknown variable.');
      draft.variables[change.ref] = change.value;
    }
    if (change.kind === 'revealMap') {
      for (const l of p.locations) {
        if (!draft.known.includes(l.id)) draft.known.push(l.id);
        draft.observations[l.id] = {
          id: l.id,
          name: l.name,
          aliases: l.aliases,
          kind: 'location',
          description: 'Revealed by designer debug control.',
          capabilities: [],
        };
      }
    }
    refreshKnowledge(p, draft);
    assertState(p, draft);
    this.past.push(before);
    if (this.past.length > 100) this.past.shift();
    this.future = [];
    this.state = draft;
    this.modified = true;
    this.transcript.push({ kind: 'status', text: 'Designer debug change: ' + change.kind });
    this.last = {
      state: draft,
      output: [],
      trace: [{ stage: 'debug', message: change.kind + ' · ' + change.ref, passed: true }],
      changes: diff(before.state, draft),
      success: true,
      committed: true,
      action: { actionId: 'debug:' + change.kind, args: { ref: change.ref, value: change.value } },
    };
    return this.view();
  }
  private checkpoint(): Checkpoint {
    return clone({ state: this.state, transcript: this.transcript, discourse: this.discourse });
  }
  private restoreCheckpoint(c: Checkpoint) {
    this.state = c.state;
    this.transcript = c.transcript;
    this.discourse = c.discourse;
    this.last = null;
    this.context = null;
  }
  cancel() {
    this.epoch++;
    this.revision++;

    this.busy = false;
    this.pending = null;
    this.remainder = [];
  }
  undo() {
    this.cancel();
    const c = this.past.pop();
    if (c) {
      this.future.push(this.checkpoint());
      this.restoreCheckpoint(c);
    }
    return this.view();
  }
  redo() {
    this.cancel();
    const c = this.future.pop();
    if (c) {
      this.past.push(this.checkpoint());
      this.restoreCheckpoint(c);
    }
    return this.view();
  }
  save(): SaveData {
    return {
      format: 'elsesave',
      schemaVersion: 2,
      gameId: this.game.project.id,
      hash: this.game.hash,
      ...this.checkpoint(),
      pending: clone(this.pending),
      remainder: [...this.remainder],
    };
  }
  restore(raw: unknown) {
    const save = readSave(raw, this.game);
    this.cancel();
    this.restoreCheckpoint(save);
    this.pending = save.pending;
    this.remainder = save.remainder;
    this.past = [];
    this.future = [];
    return this.view();
  }
  view(includeDebug = this.debug) {
    return {
      id: this.id,
      revision: this.revision,
      view: projectPlayer(this.game.project, this.state),
      transcript: this.transcript,
      pending: this.pending,
      remainder: this.remainder,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
      busy: this.busy,
      source: this.source,
      debug: includeDebug && this.debug,
      detached: this.detached,
      showCommandHints: this.showCommandHints,
      presentation: clone(this.presentation),
      modified: this.modified,
      interpretation: includeDebug && this.debug ? this.interpretation : null,
      snapshot: includeDebug && this.debug ? this.game.project : null,
      hash: this.game.hash,
      last: includeDebug && this.debug ? this.last : null,
      context: includeDebug && this.debug ? this.context : null,
    };
  }
  private commit(
    action: CanonicalAction,
    input: string,
    repeatable: boolean,
    selector?: string,
    group: string[] = [],
  ) {
    const checkpoint = this.checkpoint(),
      result = execute(this.game.project, this.state, action);
    this.last = result;
    if (!result.committed) {
      this.transcript.push({
        kind: 'status',
        text: result.error ?? 'The action could not be completed.',
      });
      return result;
    }
    this.past.push(checkpoint);
    if (this.past.length > 100) this.past.shift();
    this.future = [];
    this.state = result.state;
    this.transcript.push(
      { kind: 'command', text: input },
      ...result.output.map((text) => ({ kind: 'narration' as const, text })),
    );
    if (result.success) {
      const main = String(
        action.args.target ??
          action.args.destination ??
          action.args.item ??
          action.args.recipient ??
          '',
      );
      if (this.game.project.objects.some((o) => o.id === main)) this.discourse.object = main;
      if (this.game.project.characters.some((c) => c.id === main)) this.discourse.character = main;
      const recipient = String(action.args.recipient ?? '');
      if (this.game.project.characters.some((c) => c.id === recipient)) {
        this.discourse.character = recipient;
        this.discourse.recipient = recipient;
      }
      if (typeof action.args.topic === 'string') this.discourse.topic = action.args.topic;
    }
    this.discourse.repeat = repeatable
      ? { action: clone(action), ...(selector ? { selector } : {}) }
      : null;
    if (group.length) this.discourse.plural = [...group];
    return result;
  }
  travel(exitId: string) {
    if (this.busy) throw new Error('A command is already running.');
    const exit = projectPlayer(this.game.project, this.state).exits.find((e) => e.id === exitId);
    if (!exit) throw new Error('Choose a visible exit from your current location.');
    this.cancel();
    this.source = 'map';
    this.commit(
      { actionId: 'go', args: { exit: exitId } },
      'go ' + exit.name,
      true,
      exit.direction || exit.name,
    );
    return this.view();
  }
  async command(input: string) {
    if (this.busy) throw new Error('A command is already running.');
    const system = input.trim().toLowerCase();
    if (system === 'cancel') {
      this.cancel();
      return this.view();
    }
    if (system === 'undo') return this.undo();
    if (system === 'redo') return this.redo();
    if (system === 'help' || system === 'commands') {
      this.transcript.push({
        kind: 'status',
        text: 'Use names and aliases: LOOK, EXAMINE key, TAKE key, OPEN drawer, UNLOCK drawer WITH key, PUT photograph IN case, PUT book ON desk, ASK caretaker ABOUT photograph, SAY "hello" TO caretaker, GO NORTH. Separate commands with THEN or a semicolon. Lists and ALL are supported. SAVE, RESTORE, UNDO, REDO, RESTART, AGAIN and CANCEL are system commands.',
      });
      return this.view();
    }
    let ctx = buildContext(
      projectPlayer(this.game.project, this.state),
      this.discourse,
      this.pending,
    );
    let queue: string[];
    try {
      queue = splitCommands(input, ctx);
    } catch (error) {
      this.transcript.push({ kind: 'status', text: (error as Error).message });
      return this.view();
    }
    if (!queue.length) return this.view();
    let initial: Resolution | undefined;
    if (system === 'again' || system === 'g') {
      const repeat = clone(this.discourse.repeat);
      this.cancel();
      if (!repeat) {
        this.transcript.push({
          kind: 'status',
          text: 'There is no single action to repeat. Sequences and bulk commands are not repeatable.',
        });
        return this.view();
      }
      if (repeat.selector) queue = ['go ' + repeat.selector];
      else {
        this.commit(repeat.action, 'again', true);
        return this.view();
      }
    }
    if (this.pending) {
      if (isCommand(input, ctx)) {
        this.pending = null;
        this.remainder = [];
      } else {
        initial = interpret(input, ctx);
        if (initial.kind === 'diagnostic') {
          this.transcript.push({ kind: 'status', text: initial.message });
          return this.view();
        }
        if (initial.kind !== 'resolved') {
          this.pending = initial;
          this.transcript.push({ kind: 'status', text: clarificationText(initial) });
          return this.view();
        }
        queue = [initial.command.input, ...this.remainder];
        this.pending = null;
        this.remainder = [];
      }
    }
    const epoch = this.epoch;
    this.revision++;
    this.busy = true;
    this.source = 'local grammar';
    const sequence = queue.length > 1;
    try {
      for (let i = 0; i < queue.length; i++) {
        if (epoch !== this.epoch) break;
        ctx = buildContext(
          projectPlayer(this.game.project, this.state),
          this.discourse,
          this.pending,
        );
        this.context = ctx;
        let result: Resolution;
        try {
          result = i === 0 && initial ? initial : interpret(queue[i], ctx);
        } catch (error) {
          result = { kind: 'diagnostic', message: (error as Error).message };
        }
        this.interpretation = result;
        if (result.kind === 'diagnostic') {
          this.transcript.push({ kind: 'status', text: result.message });
          this.remainder = [];
          break;
        }
        if (result.kind !== 'resolved') {
          if (sequence) result.command.multiple = true;
          this.pending = result;
          this.remainder = queue.slice(i + 1);
          this.transcript.push({ kind: 'status', text: clarificationText(result) });
          break;
        }
        this.pending = null;
        let refused = false;
        const bulk = result.actions.length > 1 || result.command.multiple;
        if (sequence || bulk) this.discourse.repeat = null;
        for (const action of result.actions) {
          if (epoch !== this.epoch || this.state.ending) break;
          const committed = this.commit(
            action,
            queue[i],
            !sequence && !bulk,
            result.command.selector,
            result.group,
          );
          if (!committed.success) refused = true;
          if (!committed.committed) break;
        }
        this.remainder = [];
        if (refused || this.state.ending) break;
      }
    } finally {
      this.busy = false;
    }
    return this.view();
  }
}

export type SessionView = ReturnType<Session['view']>;

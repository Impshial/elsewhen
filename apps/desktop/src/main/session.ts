import {
  clone,
  type GameState,
  type TranscriptEntry,
  type ActionResult,
  type Scalar,
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
  conventional,
  validateInterpretation,
  toCanonical,
  clarificationText,
  splitCommands,
  type Clarification,
  type LanguageParser,
  type ParserContext,
} from '../../../../packages/parser/src/index';
import { readSave, type SaveData } from '../../../../packages/persistence/src/index';
type Checkpoint = { state: GameState; transcript: TranscriptEntry[]; referents: string[] };
export class Session {
  readonly id = crypto.randomUUID();
  epoch = 0;
  revision = 0;
  state: GameState;
  transcript: TranscriptEntry[];
  referents: string[] = [];
  pending: Clarification | null = null;
  remainder: string[] = [];
  last: ActionResult | null = null;
  context: ParserContext | null = null;
  source = 'conventional';
  busy = false;
  private abort: AbortController | null = null;
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
  latency = 0;
  usage: { input: number; output: number } | null = null;
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
    return clone({ state: this.state, transcript: this.transcript, referents: this.referents });
  }
  private restoreCheckpoint(c: Checkpoint) {
    this.state = c.state;
    this.transcript = c.transcript;
    this.referents = c.referents;
    this.last = null;
    this.context = null;
  }
  cancel() {
    this.epoch++;
    this.revision++;
    this.abort?.abort();
    this.abort = null;
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
      schemaVersion: 1,
      gameId: this.game.project.id,
      hash: this.game.hash,
      ...this.checkpoint(),
    };
  }
  restore(raw: unknown) {
    const save = readSave(raw, this.game);
    this.cancel();
    this.restoreCheckpoint(save);
    this.past = [];
    this.future = [];
    return this.view();
  }
  view() {
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
      debug: this.debug,
      modified: this.modified,
      latency: this.latency,
      usage: this.usage,
      snapshot: this.debug ? this.game.project : null,
      hash: this.game.hash,
      last: this.debug ? this.last : null,
      context: this.debug ? this.context : null,
    };
  }
  travel(exitId: string) {
    if (this.busy) throw new Error('A command is already being interpreted.');
    const exit = projectPlayer(this.game.project, this.state).exits.find((e) => e.id === exitId);
    if (!exit) throw new Error('Choose a visible exit from your current location.');
    this.cancel();
    const checkpoint = this.checkpoint(),
      result = execute(this.game.project, this.state, { actionId: 'go', args: { exit: exitId } });
    this.last = result;
    this.source = 'map';
    if (!result.committed) {
      this.transcript.push({ kind: 'status', text: result.error ?? 'Travel failed.' });
      return this.view();
    }
    this.past.push(checkpoint);
    if (this.past.length > 100) this.past.shift();
    this.future = [];
    this.state = result.state;
    this.transcript.push(
      { kind: 'command', text: `go ${exit.name}` },
      ...result.output.map((text) => ({ kind: 'narration' as const, text })),
    );
    this.referents = [...this.referents, exitId].slice(-6);
    return this.view();
  }
  async command(input: string, parser?: LanguageParser) {
    if (this.busy) throw new Error('A command is already being interpreted.');
    const queue = splitCommands(input);
    const epoch = this.epoch;
    const revision = ++this.revision;
    this.busy = true;
    const abort = new AbortController();
    this.abort = abort;
    try {
      for (let i = 0; i < queue.length; i++) {
        const command = queue[i];
        this.context = buildContext(
          projectPlayer(this.game.project, this.state),
          this.referents,
          this.transcript.map((e) => e.text),
          this.pending,
        );
        let envelope = conventional(command, this.context);
        this.source = 'conventional';
        if (envelope.result.kind === 'unsupported' && parser) {
          this.source = 'OpenAI';
          const started = Date.now();
          envelope = await parser.parse(command, this.context, abort.signal);
          this.latency = Date.now() - started;
          this.usage = parser.usage ?? null;
        }
        if (this.epoch !== epoch || this.revision !== revision || abort.signal.aborted)
          return this.view();
        envelope = validateInterpretation(envelope, this.context);
        const r = envelope.result;
        if (r.kind === 'unsupported') {
          this.transcript.push({
            kind: 'status',
            text: 'I could not interpret that. Try a conventional command, such as “examine case”, or enable OpenAI parsing in Settings.',
          });
          this.remainder = queue.slice(i + 1);
          break;
        }
        if (r.kind === 'clarify') {
          this.pending = r;
          this.transcript.push({ kind: 'status', text: clarificationText(r, this.context) });
          this.remainder = queue.slice(i + 1);
          break;
        }
        const checkpoint = this.checkpoint(),
          result = execute(this.game.project, this.state, toCanonical(r));
        this.last = result;
        if (!result.committed) {
          this.transcript.push({
            kind: 'status',
            text: result.error ?? 'The command could not be executed.',
          });
          this.remainder = queue.slice(i + 1);
          break;
        }
        this.past.push(checkpoint);
        if (this.past.length > 100) this.past.shift();
        this.future = [];
        this.state = result.state;
        this.pending = null;
        this.transcript.push(
          { kind: 'command', text: command },
          ...result.output.map((text) => ({ kind: 'narration' as const, text })),
        );
        this.referents = [
          ...this.referents,
          ...r.arguments.flatMap((a) => ('id' in a.value ? [a.value.id] : [])),
        ].slice(-6);
        if (!result.success || this.state.ending) {
          this.remainder = queue.slice(i + 1);
          break;
        }
        this.remainder = [];
      }
    } finally {
      if (this.epoch === epoch && this.revision === revision) {
        this.busy = false;
        this.abort = null;
      }
    }
    return this.view();
  }
}
export type SessionView = ReturnType<Session['view']>;

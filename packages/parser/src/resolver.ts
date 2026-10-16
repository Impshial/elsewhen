import {
  directionAliases,
  normalizePhrase,
  type CanonicalAction,
  type Observation,
  type PlayerView,
  type Scalar,
} from '../../domain/src/index';
import {
  emptyDiscourse,
  type Discourse,
  type ParsedCommand,
  type Clarification,
} from '../../domain/src/conversation';
import { lex, LIMITS } from './lexer';
import { type GrammarContext } from './grammar';
export type ParserContext = GrammarContext & {
  occupancy?: PlayerView['occupancy'];
  location: Observation;
  known: Observation[];
  inventory: Observation[];
  discourse: Discourse;
  pending: Clarification | null;
};
export type Resolved = {
  kind: 'resolved';
  actions: CanonicalAction[];
  command: ParsedCommand;
  score: number;
  group: string[];
};
export type Diagnostic = { kind: 'diagnostic'; message: string };
export type Resolution = Resolved | Clarification | Diagnostic;
const clean = (s: string) => normalizePhrase(s).replace(/^(the|a|an)\s+/, '');
const catalogCache = new WeakMap<ParserContext, Map<string, Set<string>>>();
function lexicalIndex(ctx: ParserContext) {
  let index = catalogCache.get(ctx);
  if (index) return index;
  index = new Map();
  for (const e of [
    ...ctx.entities,
    ...ctx.exits,
    ...ctx.topics,
    ...ctx.known.filter((e) => e.kind === 'location'),
  ])
    for (const name of [
      e.name,
      ...e.aliases,
      ...(e.nouns ?? []),
      ...(e.adjectives ?? []),
      ...(e.plurals ?? []),
    ])
      for (const word of clean(name).split(' ')) {
        const ids = index.get(word) ?? new Set<string>();
        ids.add(e.id);
        index.set(word, ids);
      }
  catalogCache.set(ctx, index);
  return index;
}
function lexical(phrase: string, e: Observation, clarifying = false): number {
  const input = clean(phrase),
    names = [e.name, ...e.aliases].map(clean);
  if (names.includes(input)) return 100;
  if ((e.nouns ?? []).map(clean).includes(input)) return 85;
  if ((e.plurals ?? []).map(clean).includes(input)) return 80;
  const words = input.split(' ').filter((w) => w !== 'one');
  const allowed = new Set([
    ...names.flatMap((x) => x.split(' ')),
    ...(e.nouns ?? []).flatMap((x) => clean(x).split(' ')),
    ...(e.adjectives ?? []).flatMap((x) => clean(x).split(' ')),
  ]);
  if (
    words.length &&
    words.every((w) => allowed.has(w)) &&
    (clarifying ||
      words.some(
        (w) =>
          names.some((n) => n.split(' ').includes(w)) ||
          (e.nouns ?? []).some((n) => clean(n).split(' ').includes(w)),
      ))
  )
    return 50 + words.length;
  return 0;
}
function publicLabel(e: Observation, ctx: ParserContext): string {
  if (e.facts?.directlyHeld) return `${e.name} (in your hand)`;
  const parent = ctx.entities.find((x) => x.id === e.facts?.parent);
  if (parent && e.facts?.visible)
    return `${e.name} (${e.facts.relation === 'on' ? 'on' : 'in'} ${parent.name})`;
  return e.name;
}
function pool(ctx: ParserContext, kind: string): Observation[] {
  return kind === 'connection' ? ctx.exits : kind === 'topic' ? ctx.topics : ctx.entities;
}
export function candidates(
  phrase: string,
  ctx: ParserContext,
  kind = 'entity',
  role = 'target',
  clarifying = false,
): { entity: Observation; score: number }[] {
  const word = clean(phrase);
  let pronoun: string[] | undefined;
  if (word === 'it') pronoun = ctx.discourse.object ? [ctx.discourse.object] : [];
  if (['him', 'her', 'he', 'she', 'them', 'they'].includes(word)) {
    if (word === 'them' && ctx.discourse.plural.length) pronoun = ctx.discourse.plural;
    else {
      const person = ctx.entities.find((e) => e.id === ctx.discourse.character),
        subject = word === 'him' ? 'he' : word === 'her' ? 'she' : word === 'them' ? 'they' : word;
      pronoun = person?.pronouns?.includes(subject) ? [person.id] : [];
    }
  }
  const entries = pool(ctx, kind);
  if (pronoun)
    return entries
      .filter((e) => pronoun!.includes(e.id) && (e.facts?.visible || e.facts?.carried))
      .map((entity) => ({ entity, score: 100 }));
  const words = word.split(' ').filter((w) => w !== 'one'),
    index = lexicalIndex(ctx);
  const possible = entries.filter(
    (e) => kind === 'connection' || words.every((w) => index.get(w)?.has(e.id)),
  );
  const ranked = possible
    .map((e) => {
      let score = lexical(phrase, e, clarifying);
      if (kind === 'connection') {
        const dir = directionAliases[word];
        if (dir && e.direction === dir) score = Math.max(score, 110);
        const dest = ctx.known.find((x) => x.id === e.destination),
          door = ctx.entities.find((x) => x.id === e.doorId);
        if (dest) score = Math.max(score, lexical(phrase, dest));
        if (door) score = Math.max(score, lexical(phrase, door));
      }
      if (score) {
        const facts = e.facts;
        score *= 10;
        score += ['item', 'instrument'].includes(role)
          ? facts?.accessible
            ? 3
            : facts?.reachable
              ? 2
              : facts?.visible
                ? 1
                : 0
          : facts?.reachable
            ? 2
            : facts?.visible
              ? 1
              : 0;
      }
      return { entity: e, score };
    })
    .filter((x) => x.score > 0);
  const best = Math.max(0, ...ranked.map((x) => x.score));
  return ranked
    .filter((x) => x.score === best)
    .sort((a, b) => a.entity.id.localeCompare(b.entity.id));
}
const countWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
const question = (
  command: ParsedCommand,
  role: string,
  items: Observation[],
  ctx: ParserContext,
  message: string,
  kind: 'missing' | 'entity' = 'entity',
): Clarification => ({
  kind,
  command,
  role,
  originalInput: command.input,
  message,
  candidates: items.map((e) => ({
    id: e.id,
    kind: e.kind === 'connection' ? 'connection' : e.kind === 'topic' ? 'topic' : 'entity',
    label: publicLabel(e, ctx),
  })),
});
function eligible(
  e: Observation,
  action: string,
  ctx: ParserContext,
  command: ParsedCommand,
): boolean {
  const f = e.facts;
  if (!f || e.kind !== 'object') return false;
  if (action === 'take' || action === 'takeFrom')
    return (
      f.reachable &&
      !f.carried &&
      e.capabilities.includes('portable') &&
      !e.capabilities.includes('scenery') &&
      (!f.npcOwned || f.allowsTaking) &&
      (action !== 'takeFrom' || f.parent === command.bindings.source)
    );
  if (['drop', 'putInside', 'putOn'].includes(action))
    return f.directlyHeld && !f.worn && e.id !== command.bindings.destination;
  return f.reachable;
}
function nounList(text: string, ctx: ParserContext): string[] {
  if (candidates(text, ctx).length) return [text];
  const tokens = lex(text);
  const result: string[] = [];
  let from = 0;
  for (const t of tokens)
    if (t.kind === 'comma' || (t.kind === 'word' && t.normalized === 'and')) {
      const part = text.slice(from, t.start).trim();
      if (part) result.push(part);
      from = t.end;
    }
  const last = text.slice(from).trim();
  if (last) result.push(last);
  return result;
}
function selection(
  command: ParsedCommand,
  role: string,
  ctx: ParserContext,
): string[] | Clarification | Diagnostic {
  const phrase = command.phrases[role],
    text = phrase?.text ?? '',
    normalized = clean(text);
  if (Array.isArray(command.bindings[role])) return command.bindings[role] as string[];
  if (typeof command.bindings[role] === 'string') return [command.bindings[role] as string];
  if (normalized === 'them' && ctx.discourse.plural.length) {
    command.multiple = true;
    return [...ctx.discourse.plural];
  }
  // A complete known phrase protects conjunctions/prepositions in names.
  const whole = candidates(text, ctx);
  const words = normalized.split(' '),
    requested = countWords[words[0]] ?? (/^\d+$/.test(words[0]) ? Number(words[0]) : undefined);
  const all = words[0] === 'all',
    plural = ctx.entities.some((e) => (e.plurals ?? []).map(clean).includes(normalized));
  if (!phrase?.quoted && (all || requested !== undefined || plural)) {
    command.multiple = true;
    if (requested !== undefined && (requested < 1 || requested > LIMITS.targets))
      return { kind: 'diagnostic', message: `Choose between 1 and ${LIMITS.targets} items.` };
    const exclusionAt = words.findIndex((w) => w === 'except' || w === 'but');
    const noun = words
      .slice(all || requested !== undefined ? 1 : 0, exclusionAt < 0 ? undefined : exclusionAt)
      .join(' ');
    let items = ctx.entities.filter(
      (e) => eligible(e, command.actionId, ctx, command) && (!noun || lexical(noun, e) > 0),
    );
    if (!noun && command.actionId === 'take') {
      const selected = new Set(items.map((e) => e.id));
      items = items.filter((e) => {
        let parent = e.facts?.parent;
        const seen = new Set<string>();
        while (parent && !seen.has(parent)) {
          if (selected.has(parent)) return false;
          seen.add(parent);
          parent = ctx.entities.find((x) => x.id === parent)?.facts?.parent;
        }
        return true;
      });
    }
    if (exclusionAt >= 0) {
      const excludes = nounList(words.slice(exclusionAt + 1).join(' '), ctx);
      for (let i = 0; i < excludes.length; i++) {
        const key = role + ':except:' + i,
          bound = command.bindings[key];
        if (typeof bound === 'string') {
          items = items.filter((e) => e.id !== bound);
          continue;
        }
        const found = candidates(excludes[i], ctx);
        if (found.length !== 1)
          return question(
            command,
            key,
            found.map((x) => x.entity),
            ctx,
            `Which ${excludes[i]} do you want to exclude?`,
            found.length ? 'entity' : 'missing',
          );
        command.bindings[key] = found[0].entity.id;
        items = items.filter((e) => e.id !== found[0].entity.id);
      }
    }
    items.sort((a, b) => a.id.localeCompare(b.id));
    if (items.length > LIMITS.targets)
      return {
        kind: 'diagnostic',
        message: `That selects more than ${LIMITS.targets} items. Narrow the selection.`,
      };
    if (!items.length)
      return {
        kind: 'diagnostic',
        message: 'There are no eligible items matching that selection.',
      };
    if (requested !== undefined && requested !== items.length) {
      if (items.length < requested)
        return {
          kind: 'diagnostic',
          message: `Only ${items.length} eligible items match; ${requested} were requested.`,
        };
      return {
        ...question(command, role, items, ctx, `Which ${requested} items do you mean?`),
        kind: 'quantity',
        count: requested,
      };
    }
    return items.map((e) => e.id);
  }
  const parts = phrase?.quoted ? [text] : whole.length ? [text] : nounList(text, ctx),
    ids: string[] = [];
  if (parts.length > 1) command.multiple = true;
  if (parts.length > LIMITS.targets)
    return { kind: 'diagnostic', message: `Use at most ${LIMITS.targets} targets.` };
  for (let i = 0; i < parts.length; i++) {
    const key = parts.length === 1 ? role : role + ':' + i,
      bound = command.bindings[key];
    if (typeof bound === 'string') {
      ids.push(bound);
      continue;
    }
    const found = candidates(parts[i], ctx, 'entity', role);
    if (!found.length) {
      if (['it', 'them', 'him', 'her', 'they'].includes(clean(parts[i])))
        return question(command, key, [], ctx, 'What do you mean by that pronoun?', 'missing');
      return {
        kind: 'diagnostic',
        message: `I cannot identify “${parts[i]}” from what you know. Try a complete name or examine your surroundings.`,
      };
    }
    if (found.length > 1)
      return question(
        command,
        key,
        found.map((x) => x.entity),
        ctx,
        `Which ${parts[i]} do you mean?`,
      );
    command.bindings[key] = found[0].entity.id;
    ids.push(found[0].entity.id);
  }
  return [...new Set(ids)];
}
export function resolveCommand(raw: ParsedCommand, ctx: ParserContext): Resolution {
  const command = structuredClone(raw),
    def = ctx.actions.find((a) => a.id === command.actionId);
  if (!def) return { kind: 'diagnostic', message: 'That action is not available.' };
  let score = 0;
  const args: Record<string, Scalar> = {},
    group: string[] = [];
  // Resolve source/destination before all expansion, but never execute any member here.
  const params = [...def.parameters].sort(
    (a, b) => Number(a.id === 'item') - Number(b.id === 'item'),
  );
  for (const param of params) {
    const role = param.id,
      phrase = command.phrases[role],
      bound = command.bindings[role];
    if (bound !== undefined && !Array.isArray(bound)) {
      args[role] = bound;
      continue;
    }
    if (!phrase?.text && !Array.isArray(bound)) {
      if (param.optional && !phrase) continue;
      return question(
        command,
        role,
        [],
        ctx,
        `What do you want to use for ${param.name} in “${def.name}”?`,
        'missing',
      );
    }
    if (param.kind === 'text') {
      args[role] = phrase.text;
      command.bindings[role] = phrase.text;
      continue;
    }
    if (param.kind === 'number') {
      const number = Number(phrase.text);
      if (!Number.isFinite(number))
        return { kind: 'diagnostic', message: `Enter a number for ${param.name}.` };
      args[role] = number;
      continue;
    }
    if (param.kind === 'boolean') {
      const value = clean(phrase.text);
      if (!['yes', 'no', 'true', 'false'].includes(value))
        return { kind: 'diagnostic', message: `Use yes or no for ${param.name}.` };
      args[role] = ['yes', 'true'].includes(value);
      continue;
    }
    if (
      role === 'item' &&
      ['take', 'takeFrom', 'drop', 'putInside', 'putOn', 'give', 'show'].includes(command.actionId)
    ) {
      const selected = selection(command, role, ctx);
      if (!Array.isArray(selected)) return selected;
      group.push(...selected);
      command.bindings[role] = selected;
      score += 1000;
      continue;
    }
    const found = candidates(phrase.text, ctx, param.kind, role);
    if (
      !found.length &&
      ['it', 'him', 'her', 'them', 'they', 'he', 'she'].includes(clean(phrase.text))
    )
      return question(command, role, [], ctx, 'What do you mean by that pronoun?', 'missing');
    if (!found.length)
      return {
        kind: 'diagnostic',
        message:
          param.kind === 'connection'
            ? `There is no visible outgoing exit matching “${phrase.text}”.`
            : `I cannot identify “${phrase.text}” from what you know.`,
      };
    if (found.length > 1)
      return question(
        command,
        role,
        found.map((x) => x.entity),
        ctx,
        `Which ${phrase.text} do you mean?`,
      );
    args[role] = found[0].entity.id;
    command.bindings[role] = found[0].entity.id;
    score += found[0].score;
  }
  if (command.actionId === 'askText') {
    const matches = candidates(String(args.text), ctx, 'topic');
    if (matches.length === 1)
      return {
        kind: 'resolved',
        actions: [
          { actionId: 'ask', args: { recipient: args.recipient, topic: matches[0].entity.id } },
        ],
        command,
        score,
        group,
      };
  }
  return {
    kind: 'resolved',
    actions: group.length
      ? group.map((item) => ({ actionId: command.actionId, args: { ...args, item } }))
      : [{ actionId: command.actionId, args }],
    command,
    score:
      score /
      Math.max(
        1,
        params.filter(
          (p) =>
            ['entity', 'topic', 'connection'].includes(p.kind) &&
            command.bindings[p.id] !== undefined,
        ).length,
      ),
    group,
  };
}
export function answerQuestion(
  input: string,
  pending: Clarification,
  ctx: ParserContext,
): Resolution {
  if (pending.kind === 'interpretation') {
    const index = Number(input.trim()) - 1;
    if (!Number.isInteger(index) || !pending.alternatives[index]) return pending;
    return resolveCommand(pending.alternatives[index], ctx);
  }
  const command = structuredClone(pending.command);
  if (pending.kind === 'missing') {
    command.phrases[pending.role] = {
      text: input,
      quoted: lex(input).length === 1 && lex(input)[0].kind === 'quoted',
    };
    if (command.phrases[pending.role].quoted)
      command.phrases[pending.role].text = lex(input)[0].text;
    return resolveCommand(command, ctx);
  }
  const choices = nounList(input, ctx),
    selected: string[] = [];
  for (const choice of choices) {
    let candidate = pending.candidates[Number(choice.trim()) - 1];
    if (!/^\d+$/.test(choice.trim())) {
      const found = candidates(
        choice,
        {
          ...ctx,
          entities: ctx.entities.filter((e) => pending.candidates.some((c) => c.id === e.id)),
          exits: ctx.exits.filter((e) => pending.candidates.some((c) => c.id === e.id)),
          topics: ctx.topics.filter((e) => pending.candidates.some((c) => c.id === e.id)),
        },
        pending.candidates[0]?.kind ?? 'entity',
        pending.role,
        true,
      );
      candidate =
        found.length === 1
          ? pending.candidates.find((c) => c.id === found[0].entity.id)!
          : undefined!;
    }
    if (!candidate || selected.includes(candidate.id)) return pending;
    selected.push(candidate.id);
  }
  if (selected.length !== (pending.kind === 'quantity' ? pending.count : 1)) return pending;
  command.bindings[pending.role] = pending.kind === 'quantity' ? selected : selected[0];
  return resolveCommand(command, ctx);
}
export function buildContext(
  view: PlayerView,
  discourse: Discourse = emptyDiscourse(),
  pending: Clarification | null = null,
): ParserContext {
  return {
    occupancy: view.occupancy,
    location: view.location,
    known: view.known,
    entities: view.known.filter((e) => e.kind === 'object' || e.kind === 'character'),
    inventory: view.inventory,
    exits: view.exits,
    topics: view.topics,
    actions: view.actions,
    discourse,
    pending,
  };
}

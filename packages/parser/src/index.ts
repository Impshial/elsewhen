import { z } from 'zod';
import {
  type CanonicalAction,
  type Observation,
  type PlayerView,
  type Scalar,
} from '../../domain/src/index';
export const parsedValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('entity'), id: z.string() }).strict(),
  z.object({ kind: z.literal('connection'), id: z.string() }).strict(),
  z.object({ kind: z.literal('topic'), id: z.string() }).strict(),
  z.object({ kind: z.literal('text'), text: z.string() }).strict(),
  z.object({ kind: z.literal('number'), number: z.number() }).strict(),
  z.object({ kind: z.literal('boolean'), boolean: z.boolean() }).strict(),
]);
const argumentSchema = z.object({ parameterId: z.string(), value: parsedValueSchema }).strict();
export const parserEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    result: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('intent'),
          actionId: z.string(),
          arguments: z.array(argumentSchema),
        })
        .strict(),
      z
        .object({
          kind: z.literal('clarify'),
          actionId: z.string().nullable(),
          parameterId: z.string().nullable(),
          arguments: z.array(argumentSchema),
          candidates: z.array(
            z.object({ kind: z.enum(['entity', 'connection', 'topic']), id: z.string() }).strict(),
          ),
          reason: z.enum(['ambiguous_reference', 'missing_parameter', 'unclear_intent']),
        })
        .strict(),
      z
        .object({
          kind: z.literal('unsupported'),
          reason: z.enum(['no_matching_action', 'insufficient_context', 'multiple_actions']),
        })
        .strict(),
    ]),
  })
  .strict();
export type ParserEnvelope = z.infer<typeof parserEnvelopeSchema>;
export type Interpretation = ParserEnvelope['result'];
export type Clarification = Extract<Interpretation, { kind: 'clarify' }>;
export type ParserContext = {
  location: Observation;
  entities: Observation[];
  exits: Observation[];
  topics: Observation[];
  actions: {
    id: string;
    name: string;
    description: string;
    aliases: string[];
    parameters: PlayerView['actions'][number]['parameters'];
    examples: string[];
  }[];
  referents: string[];
  recentTranscript: string[];
  pending: Clarification | null;
};
export interface LanguageParser {
  usage?: { input: number; output: number } | null;
  parse(command: string, context: ParserContext, signal?: AbortSignal): Promise<ParserEnvelope>;
}
const normalize = (s: string) =>
  s
    .trim()
    .toLocaleLowerCase()
    .replace(/^(?:the|a|an)\s+/, '')
    .replace(/[.!?]$/, '');
export function buildContext(
  view: PlayerView,
  referents: string[] = [],
  transcript: string[] = [],
  pending: Clarification | null = null,
): ParserContext {
  const relevant = new Set([...view.entities, ...view.inventory].map((e) => e.id));
  referents.forEach((id) => relevant.add(id));
  // Known memories have no hidden live state. Budget favors the current scene over distant memories.
  const entities = view.known
    .filter((e) => e.kind === 'object' || e.kind === 'character')
    .sort((a, b) => Number(relevant.has(b.id)) - Number(relevant.has(a.id)))
    .slice(0, 150)
    .map((e) => ({ ...e, description: e.description.slice(0, 800) }));
  return {
    location: { ...view.location, description: view.location.description.slice(0, 3000) },
    entities,
    exits: view.exits.slice(0, 100),
    topics: view.topics.slice(0, 100),
    actions: view.actions.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      aliases: a.aliases,
      parameters: a.parameters,
      examples: a.examples,
    })),
    referents: referents.filter((id) => entities.some((e) => e.id === id)).slice(-6),
    recentTranscript: transcript.slice(-6).map((s) => s.slice(0, 1000)),
    pending,
  };
}
function matches(query: string, candidates: Observation[], ctx: ParserContext): Observation[] {
  const n = normalize(query);
  if (['it', 'him', 'her', 'them'].includes(n)) {
    const recent = ctx.referents.toReversed().find((id) => candidates.some((e) => e.id === id));
    return candidates.filter((e) => e.id === recent);
  }
  if (!n) return [];
  const exact = candidates.filter((e) => [e.name, ...e.aliases].some((a) => normalize(a) === n));
  if (exact.length) return exact;
  return candidates.filter((e) =>
    [e.name, ...e.aliases].some((a) =>
      normalize(a)
        .split(' ')
        .every((word) => n.split(' ').includes(word)),
    ),
  );
}
const valueFor = (kind: string, value: Scalar): z.infer<typeof parsedValueSchema> =>
  kind === 'text'
    ? { kind: 'text', text: String(value) }
    : kind === 'number'
      ? { kind: 'number', number: Number(value) }
      : kind === 'boolean'
        ? { kind: 'boolean', boolean: value === true || value === 'true' }
        : { kind: kind as 'entity' | 'connection' | 'topic', id: String(value) };
function bind(
  actionId: string,
  raw: Record<string, string>,
  ctx: ParserContext,
  partial: Clarification['arguments'] = [],
): Interpretation {
  const def = ctx.actions.find((a) => a.id === actionId);
  if (!def) return { kind: 'unsupported', reason: 'no_matching_action' };
  const args = [...partial];
  let unresolved: Clarification | null = null;
  for (const p of def.parameters) {
    if (args.some((a) => a.parameterId === p.id)) continue;
    const query = raw[p.id];
    if (query === undefined || query === '') {
      unresolved ??= {
        kind: 'clarify',
        actionId,
        parameterId: p.id,
        arguments: args,
        candidates: [],
        reason: 'missing_parameter',
      };
      continue;
    }
    if (['text', 'number', 'boolean'].includes(p.kind)) {
      args.push({ parameterId: p.id, value: valueFor(p.kind, query) });
      continue;
    }
    const candidates =
      p.kind === 'connection'
        ? ctx.exits
        : p.kind === 'topic'
          ? ctx.topics
          : ctx.entities.filter(
              (e) =>
                (p.entityKind === 'any' || e.kind === p.entityKind) &&
                (!p.capability || e.capabilities.includes(p.capability)),
            );
    const found = matches(query, candidates, ctx);
    if (found.length !== 1) {
      unresolved ??= {
        kind: 'clarify',
        actionId,
        parameterId: p.id,
        arguments: args,
        candidates: found.map((e) => ({
          kind: p.kind as 'entity' | 'connection' | 'topic',
          id: e.id,
        })),
        reason: found.length ? 'ambiguous_reference' : 'missing_parameter',
      };
      continue;
    }
    args.push({ parameterId: p.id, value: valueFor(p.kind, found[0].id) });
  }
  return unresolved
    ? { ...unresolved, arguments: args }
    : { kind: 'intent', actionId, arguments: args };
}
export function conventional(command: string, ctx: ParserContext): ParserEnvelope {
  const input = command.trim(),
    n = normalize(input);
  let result: Interpretation | undefined;
  if (ctx.pending?.actionId && ctx.pending.parameterId) {
    const pending = ctx.pending,
      def = ctx.actions.find((a) => a.id === pending.actionId),
      param = def?.parameters.find((p) => p.id === pending.parameterId);
    const selected = pending.candidates[Number(n) - 1];
    const raw = selected
      ? (ctx.entities.concat(ctx.exits, ctx.topics).find((e) => e.id === selected.id)?.name ??
        input)
      : input;
    if (param)
      result = bind(pending.actionId!, { [pending.parameterId!]: raw }, ctx, pending.arguments);
  } else if (/^(l|look|look around|what can i see here)$/.test(n)) result = bind('look', {}, ctx);
  else if (/^(i|inventory)$/.test(n)) result = bind('inventory', {}, ctx);
  else if (/^(z|wait)$/.test(n)) result = bind('wait', {}, ctx);
  else {
    let m: RegExpMatchArray | null;
    if ((m = input.match(/^(?:say|speak)\s+["“](.*?)["”]\s+to\s+(.+)$/i)))
      result = bind('speak', { text: m[1], target: m[2] }, ctx);
    else if ((m = input.match(/^use\s+(.+?)\s+(?:on|with)\s+(.+)$/i)))
      result = bind('use', { tool: m[1], target: m[2] }, ctx);
    else if ((m = input.match(/^(unlock|lock)\s+(.+?)\s+with\s+(.+)$/i)))
      result = bind(m[1].toLowerCase(), { target: m[2], tool: m[3] }, ctx);
    else if ((m = input.match(/^(?:put|insert|place)\s+(.+?)\s+(?:in|into|on|onto)\s+(.+)$/i)))
      result = bind('put', { tool: m[1], target: m[2] }, ctx);
    else if ((m = input.match(/^give\s+(.+?)\s+to\s+(.+)$/i)))
      result = bind('give', { tool: m[1], target: m[2] }, ctx);
    else if ((m = input.match(/^(?:take|get|pick up)\s+(.+?)\s+from\s+(.+)$/i)))
      result = bind('takeFrom', { target: m[1], source: m[2] }, ctx);
    else if ((m = input.match(/^ask\s+(.+?)\s+about\s+(.+)$/i))) {
      const topics = matches(m[2], ctx.topics, ctx);
      result = topics.length
        ? bind('ask', { target: m[1], topic: m[2] }, ctx)
        : bind('askText', { target: m[1], text: m[2] }, ctx);
    } else if (
      (m = input.match(
        /^(take|get|pick up|drop|open|close|read|examine|x|wear|remove|talk to|talk|go|enter)\b\s*(.*)$/i,
      ))
    ) {
      const verb = m[1].toLowerCase(),
        a =
          (
            {
              get: 'take',
              'pick up': 'take',
              x: 'examine',
              'talk to': 'talk',
              enter: 'go',
            } as Record<string, string>
          )[verb] ?? verb;
      result = bind(
        a,
        {
          [a === 'go' ? 'exit' : 'target']: m[2],
        },
        ctx,
      );
    } else {
      const exit = matches(input, ctx.exits, ctx);
      if (exit.length) result = bind('go', { exit: input }, ctx);
      else {
        const a = ctx.actions.find((a) =>
          a.aliases.some((alias) => n === normalize(alias) || n.startsWith(normalize(alias) + ' ')),
        );
        if (a) {
          const alias = a.aliases.find((alias) => n.startsWith(normalize(alias)))!;
          const segments = input
            .slice(alias.length)
            .trim()
            .split(/\s*\|\s*/);
          result = bind(
            a.id,
            Object.fromEntries(a.parameters.map((p, i) => [p.id, segments[i] ?? ''])),
            ctx,
          );
        }
      }
    }
  }
  return {
    schemaVersion: 1,
    result: result ?? { kind: 'unsupported', reason: 'no_matching_action' },
  };
}
export function validateInterpretation(raw: unknown, ctx: ParserContext): ParserEnvelope {
  const parsed = parserEnvelopeSchema.parse(raw),
    r = parsed.result;
  if (r.kind === 'unsupported') return parsed;
  if (r.kind === 'clarify' && r.actionId === null) {
    if (r.arguments.length || r.candidates.length || r.parameterId !== null)
      throw new Error('An unclear intent cannot bind arguments.');
    return parsed;
  }
  const def = ctx.actions.find((a) => a.id === r.actionId);
  if (!def) throw new Error('Parser returned an unknown action.');
  const seen = new Set<string>();
  for (const a of r.arguments) {
    const p = def.parameters.find((p) => p.id === a.parameterId);
    if (!p || p.kind !== a.value.kind || seen.has(a.parameterId))
      throw new Error('Parser returned invalid parameter bindings.');
    seen.add(a.parameterId);
    if ('id' in a.value) {
      const items =
        a.value.kind === 'entity'
          ? ctx.entities
          : a.value.kind === 'connection'
            ? ctx.exits
            : ctx.topics;
      const id = a.value.id;
      if (!items.some((e) => e.id === id))
        throw new Error('Parser returned an identifier outside public context.');
    }
  }
  if (r.kind === 'intent' && def.parameters.some((p) => !seen.has(p.id)))
    throw new Error('Parser omitted a required argument.');
  if (r.kind === 'clarify') {
    if (r.parameterId && !def.parameters.some((p) => p.id === r.parameterId))
      throw new Error('Unknown clarification parameter.');
    const p = def.parameters.find((p) => p.id === r.parameterId);
    for (const c of r.candidates) {
      const items =
        c.kind === 'entity' ? ctx.entities : c.kind === 'connection' ? ctx.exits : ctx.topics;
      if (c.kind !== p?.kind || !items.some((e) => e.id === c.id))
        throw new Error('Invalid clarification candidate.');
    }
  }
  return parsed;
}
export function toCanonical(r: Extract<Interpretation, { kind: 'intent' }>): CanonicalAction {
  return {
    actionId: r.actionId,
    args: Object.fromEntries(
      r.arguments.map((a) => [
        a.parameterId,
        'id' in a.value
          ? a.value.id
          : 'text' in a.value
            ? a.value.text
            : 'number' in a.value
              ? a.value.number
              : a.value.boolean,
      ]),
    ),
  };
}
export function clarificationText(r: Clarification, ctx: ParserContext): string {
  const param = ctx.actions
    .find((a) => a.id === r.actionId)
    ?.parameters.find((p) => p.id === r.parameterId);
  return r.candidates.length
    ? `Which ${param?.name ?? 'one'} do you mean? ${r.candidates.map((c, i) => `${i + 1}. ${[...ctx.entities, ...ctx.exits, ...ctx.topics].find((e) => e.id === c.id)?.name}`).join(' · ')}`
    : `Please specify ${param?.name ?? 'what you would like to do'}.`;
}
export function splitCommands(input: string): string[] {
  let quote = '',
    chunk = '';
  const parts: string[] = [];
  for (const char of input) {
    if (char === '"' || char === '“' || char === '”') {
      quote = quote ? '' : char;
      chunk += char;
    } else if (char === ';' && !quote) {
      if (chunk.trim()) parts.push(chunk.trim());
      chunk = '';
    } else chunk += char;
  }
  if (chunk.trim()) parts.push(chunk.trim());
  if (parts.length > 8) throw new Error('A queue can contain at most eight commands.');
  return parts;
}
export class ConventionalParser implements LanguageParser {
  async parse(c: string, ctx: ParserContext) {
    return conventional(c, ctx);
  }
}
export class FixtureParser implements LanguageParser {
  constructor(private fixtures: Record<string, ParserEnvelope>) {}
  async parse(c: string, ctx: ParserContext) {
    return validateInterpretation(this.fixtures[c], ctx);
  }
}

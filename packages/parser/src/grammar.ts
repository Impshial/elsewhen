import { directionAliases, type ActionDefinition, type Observation } from '../../domain/src/index';
import { type ParsedCommand } from '../../domain/src/conversation';
import { lex, tokenPhrase, LIMITS } from './lexer';
export type GrammarContext = {
  actions: ActionDefinition[];
  entities: Observation[];
  exits: Observation[];
  topics: Observation[];
};
const literalWords = (text: string) => lex(text).map((t) => t.normalized);
export function isCommand(input: string, ctx: GrammarContext): boolean {
  const words = lex(input).map((t) => t.normalized);
  if (directionAliases[words.join(' ')]) return true;
  if (
    [
      'again',
      'g',
      'help',
      'commands',
      'cancel',
      'undo',
      'redo',
      'save',
      'restore',
      'load',
      'restart',
    ].includes(words[0])
  )
    return true;
  return ctx.actions.some((a) =>
    a.forms.some((f) => {
      const first = f.parts[0];
      if (first?.kind !== 'literal') return false;
      return literalWords(first.text).every((w, i) => words[i] === w);
    }),
  );
}
export function splitCommands(input: string, ctx?: GrammarContext): string[] {
  const tokens = lex(input);
  const result: string[] = [];
  let start = 0;
  const protectedPositions = new Set<number>();
  if (ctx)
    for (const e of [...ctx.entities, ...ctx.exits, ...ctx.topics])
      for (const name of [e.name, ...e.aliases, ...(e.nouns ?? [])]) {
        const words = literalWords(name);
        if (words.length < 2) continue;
        for (let at = 0; at + words.length <= tokens.length; at++)
          if (
            words.every((w, j) => tokens[at + j].kind === 'word' && tokens[at + j].normalized === w)
          )
            for (let j = at; j < at + words.length; j++) protectedPositions.add(j);
      }
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === 'quoted' || protectedPositions.has(i)) continue;
    const currentWords = lex(input.slice(start, t.start)).map((t) => t.normalized);
    const freeText = ctx?.actions.some(
      (a) =>
        a.parameters.some((p) => p.kind === 'text') &&
        a.forms.some(
          (f) =>
            f.parts[0]?.kind === 'literal' &&
            literalWords(f.parts[0].text).every((w, j) => currentWords[j] === w),
        ),
    );
    const boundary =
      t.kind === 'separator' ||
      t.normalized === 'then' ||
      (t.normalized === 'and' && !freeText && ctx && isCommand(input.slice(t.end), ctx));
    if (boundary) {
      const clause = input.slice(start, t.start).trim();
      if (!clause) throw new Error('A command is missing between sequence separators.');
      result.push(clause);
      start = t.end;
    }
  }
  const last = input.slice(start).trim();
  if (last) result.push(last);
  else if (result.length) throw new Error('Finish the last command in the sequence.');
  if (result.length > LIMITS.clauses)
    throw new Error(`Use at most ${LIMITS.clauses} commands in one sequence.`);
  return result;
}
export type GrammarMatch = { command: ParsedCommand; specificity: number; missing: number };
/** Bounded production matching considers each possible role boundary, preserving every token. */
export function matchGrammar(input: string, ctx: GrammarContext): GrammarMatch[] {
  let tokens = lex(input);
  if (tokens[0]?.normalized === 'please') tokens = tokens.slice(1);
  const direction = directionAliases[tokenPhrase(tokens).toLowerCase()];
  if (direction)
    return [
      {
        command: {
          actionId: 'go',
          formId: 'direction',
          input,
          multiple: false,
          phrases: { exit: { text: direction, quoted: false } },
          bindings: {},
          selector: direction,
        },
        specificity: 2,
        missing: 0,
      },
    ];
  const matches: GrammarMatch[] = [];
  let work = 0;
  for (const action of ctx.actions)
    for (const form of action.forms) {
      const visit = (
        part: number,
        at: number,
        phrases: ParsedCommand['phrases'],
        specificity: number,
        missing: number,
      ) => {
        if (++work > LIMITS.work)
          throw new Error(
            'That command has too many possible interpretations. Quote the object names or use a shorter command.',
          );
        if (part === form.parts.length) {
          if (at === tokens.length) {
            matches.push({
              command: {
                actionId: action.id,
                formId: form.id,
                input,
                multiple: false,
                phrases,
                bindings: {},
                ...(action.id === 'go' ? { selector: phrases.exit?.text } : {}),
              },
              specificity,
              missing,
            });
            if (matches.length > LIMITS.alternatives)
              throw new Error(
                'Too many interpretations. Quote the names to make the command precise.',
              );
          }
          return;
        }
        const segment = form.parts[part];
        if (segment.kind === 'literal') {
          const words = literalWords(segment.text);
          if (
            words.every(
              (w, j) => tokens[at + j]?.kind === 'word' && tokens[at + j].normalized === w,
            )
          )
            visit(part + 1, at + words.length, phrases, specificity + words.length, missing);
          else if (at === tokens.length && part > 0)
            visit(part + 1, at, phrases, specificity, missing + 1);
        } else {
          if (at === tokens.length) {
            visit(
              part + 1,
              at,
              { ...phrases, [segment.role]: { text: '', quoted: false } },
              specificity,
              missing + 1,
            );
            return;
          }
          const ends =
            tokens[at].kind === 'quoted'
              ? [at + 1]
              : Array.from({ length: tokens.length - at }, (_, j) => at + j + 1);
          for (const end of ends) {
            const range = tokens.slice(at, end);
            if (range.some((t) => t.kind === 'separator')) continue;
            const phrase =
              range.length === 1 && range[0].kind === 'quoted'
                ? range[0].text
                : input.slice(range[0].start, range.at(-1)!.end).replace(/[.!?]+$/u, '');
            visit(
              part + 1,
              end,
              {
                ...phrases,
                [segment.role]: {
                  text: phrase,
                  quoted: range.length === 1 && range[0].kind === 'quoted',
                },
              },
              specificity,
              missing,
            );
          }
        }
      };
      visit(0, 0, {}, 0, 0);
    }
  return matches;
}

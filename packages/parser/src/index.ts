import { stableStringify } from '../../domain/src/index';
import { type Clarification } from '../../domain/src/conversation';
import { matchGrammar, isCommand } from './grammar';
import {
  answerQuestion,
  resolveCommand,
  type ParserContext,
  type Resolution,
  type Resolved,
} from './resolver';
export { buildContext } from './resolver';
export type { ParserContext, Resolution, Resolved } from './resolver';
export type { Clarification, Discourse, ParsedCommand } from '../../domain/src/conversation';
export { emptyDiscourse } from '../../domain/src/conversation';
export { splitCommands, isCommand } from './grammar';
export { lex, LIMITS } from './lexer';
export function interpret(input: string, ctx: ParserContext): Resolution {
  if (input.trim().toLowerCase() === 'out' && ctx.occupancy)
    return resolveCommand(
      {
        actionId: 'exit',
        formId: 'occupancy-exit',
        input,
        multiple: false,
        phrases: {},
        bindings: {},
      },
      ctx,
    );
  if (ctx.pending && !isCommand(input, ctx)) return answerQuestion(input, ctx.pending, ctx);
  const wait = /^(?:wait|z)\s+(\d+)(?:\s+turns?)?$/i.exec(input.trim());
  if (wait) {
    const n = Number(wait[1]);
    if (n < 1 || n > 32) return { kind: 'diagnostic', message: 'Wait for between 1 and 32 turns.' };
    return {
      kind: 'resolved',
      actions: Array.from({ length: n }, () => ({ actionId: 'wait', args: {} })),
      command: {
        actionId: 'wait',
        formId: 'wait-count',
        input,
        multiple: true,
        phrases: {},
        bindings: {},
      },
      group: [],
      score: 1,
    };
  }
  const matches = matchGrammar(input, ctx);
  if (!matches.length)
    return {
      kind: 'diagnostic',
      message:
        'I do not recognize that form. Try “examine key”, “take key”, or “unlock drawer with key”. Type commands for help.',
    };
  const evaluated = matches.map((m) => ({ match: m, result: resolveCommand(m.command, ctx) }));
  const successes = evaluated.filter(
    (x): x is { match: (typeof matches)[number]; result: Resolved } =>
      x.result.kind === 'resolved' && x.match.missing === 0,
  );
  if (successes.length) {
    const best = Math.max(...successes.map((x) => x.result.score));
    const unique = [
      ...new Map(
        successes
          .filter((x) => x.result.score === best)
          .map((x) => [stableStringify(x.result.actions), x.result]),
      ).values(),
    ];
    if (unique.length === 1) return unique[0];
    return {
      kind: 'interpretation',
      command: unique[0].command,
      role: '',
      originalInput: input,
      candidates: unique.map((r, i) => ({
        id: String(i),
        kind: 'entity',
        label: ctx.actions.find((a) => a.id === r.command.actionId)?.name ?? r.command.actionId,
      })),
      alternatives: unique.map((r) => r.command),
      message: 'Which interpretation do you mean?',
    };
  }
  return (
    evaluated
      .filter((x) => x.result.kind !== 'resolved')
      .sort(
        (a, b) => b.match.specificity - a.match.specificity || a.match.missing - b.match.missing,
      )[0]?.result ?? {
      kind: 'diagnostic',
      message: 'Finish the command phrase, including its preposition.',
    }
  );
}
export function clarificationText(q: Clarification): string {
  return (
    q.message +
    (q.candidates.length
      ? '\n' + q.candidates.map((c, i) => i + 1 + '. ' + c.label).join('\n')
      : '')
  );
}

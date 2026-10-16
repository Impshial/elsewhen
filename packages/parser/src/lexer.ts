import { normalizePhrase } from '../../domain/src/index';
export const LIMITS = {
  input: 8000,
  tokens: 2048,
  clauses: 32,
  targets: 100,
  alternatives: 128,
  work: 20000,
};
export type Token = {
  kind: 'word' | 'quoted' | 'separator' | 'comma';
  text: string;
  normalized: string;
  start: number;
  end: number;
};
export function lex(input: string): Token[] {
  if (input.length > LIMITS.input)
    throw new Error(`Commands are limited to ${LIMITS.input} characters.`);
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    if (/\s/u.test(input[i])) {
      i++;
      continue;
    }
    const start = i,
      ch = input[i];
    let text = '',
      kind: Token['kind'] = 'word';
    if (ch === '"' || ch === '“') {
      kind = 'quoted';
      const close = ch === '“' ? '”' : '"';
      i++;
      let closed = false;
      while (i < input.length) {
        const c = input[i++];
        if (c === '\\') {
          if (i >= input.length) throw new Error('Finish the quoted text before continuing.');
          const escaped = input[i++];
          if (!['"', '\\', '”'].includes(escaped))
            throw new Error('Inside quotes, escape only a quote or backslash.');
          text += escaped;
        } else if (c === close) {
          closed = true;
          break;
        } else text += c;
      }
      if (!closed) throw new Error('Finish the quoted text before continuing.');
    } else if (ch === ';' || ch === ',') {
      kind = ch === ';' ? 'separator' : 'comma';
      text = ch;
      i++;
    } else {
      while (i < input.length && !/[\s;,"“]/u.test(input[i])) text += input[i++];
      // Sentence punctuation is syntax, while punctuation within a name remains vocabulary.
      text = text.replace(/[.!?]+$/u, '');
      if (!text) continue;
    }
    tokens.push({ kind, text, normalized: normalizePhrase(text), start, end: i });
    if (tokens.length > LIMITS.tokens) throw new Error('This command contains too many words.');
  }
  return tokens;
}
export const tokenPhrase = (tokens: Token[]) => tokens.map((t) => t.text).join(' ');

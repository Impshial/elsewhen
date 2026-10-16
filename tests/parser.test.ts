import { describe, it, expect, vi } from 'vitest';
import {
  parserEnvelopeSchema,
  buildContext,
  conventional,
  validateInterpretation,
  splitCommands,
  FixtureParser,
} from '../packages/parser/src/index';
import { OpenAIParser } from '../packages/parser/src/openai';
import { foldedHorizon } from '../examples/the-folded-horizon/sample';
import { startGame, projectPlayer } from '../packages/engine/src/index';
import type OpenAI from 'openai';
const p = foldedHorizon(),
  ctx = buildContext(projectPlayer(p, startGame(p).state));
describe('strict interpretation boundary', () => {
  it('rejects unexpected fields and identifiers outside public knowledge', () => {
    const valid = conventional('take lantern', ctx);
    expect(() => parserEnvelopeSchema.parse({ ...valid, state: { ending: 'win' } })).toThrow();
    const hidden = structuredClone(valid);
    if (hidden.result.kind === 'intent')
      hidden.result.arguments[0].value = { kind: 'entity', id: 'obj-token' };
    expect(() => validateInterpretation(hidden, ctx)).toThrow('outside public context');
  });
  it('retains resolved target while clarifying a missing tool', () => {
    const first = conventional('use unknown on anchor', ctx).result;
    expect(first.kind).toBe('clarify');
    if (first.kind === 'clarify') {
      expect(first.arguments).toEqual([
        { parameterId: 'target', value: { kind: 'entity', id: 'obj-anchor' } },
      ]);
      const next = conventional('lantern', { ...ctx, pending: first }).result;
      expect(next.kind).toBe('intent');
    }
  });
  it('retains quoted semicolons and enforces a bounded queue', () => {
    expect(splitCommands('say "a;b" to console; look')).toEqual(['say "a;b" to console', 'look']);
    expect(() => splitCommands(Array(9).fill('look').join(';'))).toThrow('eight');
  });
  it('rechecks fixtures with the same semantic validator', async () => {
    const parser = new FixtureParser({ hello: conventional('look', ctx) });
    expect((await parser.parse('hello', ctx)).result.kind).toBe('intent');
  });
});
describe('OpenAI transport adapter', () => {
  it('requests strict structured output without storing context and validates the result', async () => {
    const result = conventional('take lantern', ctx),
      create = vi.fn().mockResolvedValue({
        status: 'completed',
        output: [],
        output_text: JSON.stringify(result),
        usage: { input_tokens: 42, output_tokens: 8 },
      }),
      parser = new OpenAIParser({ responses: { create } } as unknown as Pick<OpenAI, 'responses'>);
    expect(await parser.parse('pick up that lantern', ctx)).toEqual(result);
    const request = create.mock.calls[0][0];
    expect(request.store).toBe(false);
    expect(request.text.format.strict).toBe(true);
    expect(request.text.format.schema.type).toBe('object');
    expect(request.input).not.toContain('Meridian');
    expect(parser.usage).toEqual({ input: 42, output: 8 });
  });
  it.each(['incomplete', 'failed'])(
    'rejects %s responses before interpretation',
    async (status) => {
      const parser = new OpenAIParser({
        responses: { create: async () => ({ status, output: [], output_text: 'not JSON' }) },
      } as unknown as Pick<OpenAI, 'responses'>);
      await expect(parser.parse('look', ctx)).rejects.toThrow('incomplete');
    },
  );
  it('rejects provider refusals without passing them to the engine', async () => {
    const parser = new OpenAIParser({
      responses: {
        create: async () => ({
          status: 'completed',
          output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }],
          output_text: '',
        }),
      },
    } as unknown as Pick<OpenAI, 'responses'>);
    await expect(parser.parse('look', ctx)).rejects.toThrow('declined');
  });
});

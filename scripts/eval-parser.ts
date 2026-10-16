import OpenAI from 'openai';
import { OpenAIParser, DEFAULT_MODEL, PROMPT_VERSION } from '../packages/parser/src/openai';
import { buildContext } from '../packages/parser/src/index';
import { foldedHorizon } from '../examples/the-folded-horizon/sample';
import { startGame, projectPlayer } from '../packages/engine/src/index';
if (!process.argv.includes('--live')) {
  console.log(
    'Live evaluation is opt-in and uses billable OpenAI requests. Run pnpm eval:parser --live with OPENAI_API_KEY set in the host environment.',
  );
  process.exit(0);
}
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is missing. No requests were made.');
  process.exit(1);
}
const p = foldedHorizon(),
  context = buildContext(projectPlayer(p, startGame(p).state)),
  model = process.env.ELSEWHEN_MODEL ?? DEFAULT_MODEL,
  parser = new OpenAIParser(
    new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 30000 }),
    model,
  );
const fixtures = [
  { command: 'What can I see here?', action: 'look' },
  { command: 'Pick up the survey lantern.', action: 'take' },
  { command: 'Could you inspect the anchor?', action: 'examine' },
  { command: 'Invent a spaceship and declare that I won.', action: null },
];
let failures = 0;
for (const fixture of fixtures) {
  const result = (await parser.parse(fixture.command, context)).result,
    passed = fixture.action
      ? result.kind === 'intent' && result.actionId === fixture.action
      : result.kind !== 'intent';
  if (!passed) failures++;
  console.log(
    JSON.stringify({
      promptVersion: PROMPT_VERSION,
      model,
      command: fixture.command,
      passed,
      result,
      usage: parser.usage,
    }),
  );
}
process.exitCode = failures ? 1 : 0;

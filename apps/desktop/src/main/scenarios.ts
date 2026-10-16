import { compile } from '../../../../packages/compiler/src/index';
import { type Project } from '../../../../packages/domain/src/index';
import { type Scenario, type ScenarioResult } from '../../../../packages/domain/src/scenarios';
import { carried } from '../../../../packages/engine/src/index';
import { Session } from './session';
export async function runScenario(project: Project, scenario: Scenario): Promise<ScenarioResult> {
  const test = new Session(compile(project), true),
    result: ScenarioResult = { passed: true, steps: [], ending: null, turn: 0 };
  for (let step = 0; step < scenario.commands.length; step++) {
    const command = scenario.commands[step],
      at = test.transcript.length;
    test.last = null;
    await test.command(command);
    const last = test.last as Session['last'];
    const output = test.transcript
        .slice(at)
        .filter((x) => x.kind !== 'command')
        .map((x) => x.text),
      text = output.join('\n');
    const system = /^(help|commands|cancel|undo|redo)$/i.test(command.trim());
    const outcome = system
      ? 'system'
      : test.pending
        ? 'question'
        : last?.error
          ? 'internal error'
          : last?.success
            ? 'success'
            : last?.committed
              ? 'refusal'
              : 'parse error';
    const assertions = scenario.assertions
      .filter((a) => a.step === step)
      .map((a) => {
        let passed = false;
        switch (a.kind) {
          case 'question':
            passed = !!test.pending && (!a.value || test.pending.kind === a.value);
            break;
          case 'refusal':
            passed = outcome === 'refusal';
            break;
          case 'action':
            passed = last?.action.actionId === a.ref;
            break;
          case 'entity':
            passed = last?.action.args[a.role] === a.ref;
            break;
          case 'location':
            passed = test.state.location === a.ref;
            break;
          case 'inventory':
            passed = carried(test.state, a.ref) === (a.value !== false);
            break;
          case 'variable':
            passed = test.state.variables[a.ref] === a.value;
            break;
          case 'property': {
            const object = test.state.objects[a.ref];
            passed =
              (object && a.key in object
                ? (object as unknown as Record<string, unknown>)[a.key]
                : (object?.properties[a.key] ?? test.state.characterProperties[a.ref]?.[a.key])) ===
              a.value;
            break;
          }
          case 'turn':
            passed = test.state.turn === Number(a.value);
            break;
          case 'ending':
            passed = test.state.ending === a.ref;
            break;
          case 'textIncludes':
            passed = text.includes(String(a.value));
            break;
          case 'textExact':
            passed = text === String(a.value);
            break;
        }
        return {
          description:
            a.kind +
            (a.ref
              ? ' · ' +
                [
                  ...project.objects,
                  ...project.characters,
                  ...project.locations,
                  ...project.variables,
                  ...project.endings,
                ].find((x) => x.id === a.ref)?.name
              : ''),
          passed,
        };
      });
    const expectedNonSuccess = scenario.assertions.some(
      (a) => a.step === step && ['question', 'refusal'].includes(a.kind),
    );
    const passed =
      outcome !== 'internal error' &&
      (['success', 'system'].includes(outcome) || expectedNonSuccess) &&
      assertions.every((a) => a.passed);
    result.steps.push({
      command,
      passed,
      output,
      outcome,
      assertions,
      action: last?.action,
      trace: last?.trace,
      changes: last?.changes,
      error: last?.error,
    });
    if (!passed) {
      result.passed = false;
      break;
    }
  }
  result.ending = test.state.ending;
  result.turn = test.state.turn;
  if (scenario.ending && result.ending !== scenario.ending) result.passed = false;
  return result;
}

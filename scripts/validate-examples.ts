import { readFile } from 'node:fs/promises';
import { compile, validateProject } from '../packages/compiler/src/index';
import { projectSchema } from '../packages/domain/src/index';
import { Session } from '../apps/desktop/src/main/session';
const project = projectSchema.parse(
  JSON.parse(await readFile('examples/the-folded-horizon/project.elsewhen.json', 'utf8')),
);
const issues = validateProject(project);
if (issues.some((i) => i.severity === 'error')) throw new Error(JSON.stringify(issues));
const scenarios = JSON.parse(
  await readFile('examples/the-folded-horizon/tests/scenarios.json', 'utf8'),
);
for (const scenario of scenarios.scenarios) {
  const session = new Session(compile(project), true);
  for (const command of scenario.commands) {
    await session.command(command);
    if (!session.last?.success)
      throw new Error(
        `${scenario.name}: ${command}: ${session.last?.error ?? session.last?.output.join(' ')}`,
      );
  }
  if (scenario.ending && session.state.ending !== scenario.ending)
    throw new Error('Expected ending not reached.');
  console.log(
    `PASS ${scenario.name}: ${scenario.commands.length} commands, turn ${session.state.turn}, ending ${session.state.ending}`,
  );
}

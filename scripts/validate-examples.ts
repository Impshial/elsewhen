import { readFile } from 'node:fs/promises';
import { projectSchema } from '../packages/domain/src/index';
import { scenariosSchema } from '../packages/domain/src/scenarios';
import { runScenario } from '../apps/desktop/src/main/scenarios';
for (const name of ['the-folded-horizon', 'local-adventure']) {
  const project = projectSchema.parse(
    JSON.parse(await readFile('examples/' + name + '/project.elsewhen.json', 'utf8')),
  );
  const scenarios = scenariosSchema.parse(
    JSON.parse(await readFile('examples/' + name + '/tests/scenarios.json', 'utf8')),
  );
  for (const scenario of scenarios.scenarios) {
    const result = await runScenario(project, scenario);
    if (!result.passed) throw new Error(JSON.stringify(result));
    console.log(
      'PASS ' +
        name +
        ': ' +
        scenario.name +
        '; ' +
        result.steps.length +
        ' commands; turn ' +
        result.turn +
        '; ending ' +
        result.ending,
    );
  }
}

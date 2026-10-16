import { localAdventure, localWalkthrough } from '../examples/local-adventure/sample';
import { mkdir, writeFile } from 'node:fs/promises';
import { foldedHorizon, walkthrough } from '../examples/the-folded-horizon/sample';
import { stableStringify } from '../packages/domain/src/index';
await mkdir('examples/the-folded-horizon/tests', { recursive: true });
await writeFile(
  'examples/the-folded-horizon/project.elsewhen.json',
  stableStringify(foldedHorizon()) + '\n',
);
await writeFile(
  'examples/the-folded-horizon/tests/scenarios.json',
  stableStringify({
    format: 'elsewhen-scenarios',
    schemaVersion: 2,
    scenarios: [
      {
        id: 'scenario-homeward',
        name: 'Find the way home',
        commands: walkthrough,
        ending: 'homeward',
      },
    ],
  }) + '\n',
);

await mkdir('examples/local-adventure/tests', { recursive: true });
await writeFile(
  'examples/local-adventure/project.elsewhen.json',
  stableStringify(localAdventure()) + '\n',
);
await writeFile(
  'examples/local-adventure/tests/scenarios.json',
  stableStringify({
    format: 'elsewhen-scenarios',
    schemaVersion: 2,
    scenarios: [
      {
        id: 'courtyard-walkthrough',
        name: 'Open the courtyard',
        commands: localWalkthrough,
        ending: '',
        assertions: [{ step: 8, kind: 'variable', ref: 'rang', value: true }],
      },
    ],
  }) + '\n',
);

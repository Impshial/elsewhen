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
    schemaVersion: 1,
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

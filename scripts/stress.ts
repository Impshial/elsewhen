import os from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { projectSchema } from '../packages/domain/src/index';
import { compile } from '../packages/compiler/src/index';
import { startGame, execute, projectPlayer } from '../packages/engine/src/index';
const project = projectSchema.parse({
  id: 'stress-fixture',
  title: 'Scale fixture',
  start: 'l0',
  locations: Array.from({ length: 1000 }, (_, i) => ({
    id: `l${i}`,
    name: `Location ${i}`,
    position: [i % 40, Math.sin(i), Math.floor(i / 40)],
  })),
  connections: Array.from({ length: 3000 }, (_, i) => ({
    id: `c${i}`,
    name: `Path ${i}`,
    from: `l${i % 1000}`,
    to: `l${(i + 1 + (i % 3) * 31) % 1000}`,
  })),
  objects: Array.from({ length: 5000 }, (_, i) => ({
    id: `o${i}`,
    name: `Object ${i}`,
    placement: { kind: 'location', id: `l${i % 1000}` },
    capabilities: ['portable'],
  })),
  rules: Array.from({ length: 1000 }, (_, i) => ({
    id: `r${i}`,
    name: `Rule ${i}`,
    trigger: 'wait',
    scope: `l${i}`,
    phase: 'after',
    effects: [],
  })),
});
const time = <T>(name: string, fn: () => T) => {
  const start = performance.now(),
    value = fn();
  console.log(`${name}: ${(performance.now() - start).toFixed(1)} ms`);
  return value;
};
console.log(
  `${os.platform()} ${os.release()} ${os.arch()} · ${os.cpus()[0].model} · ${Math.round(os.totalmem() / 1024 ** 3)} GiB · Node ${process.version}`,
);
const game = time('Compile 1000 locations / 3000 connections / 5000 objects / 1000 rules', () =>
  compile(project),
);
const initial = time('Start and observe', () => startGame(game.project));
const result = time('Wait transaction', () =>
  execute(game.project, initial.state, { actionId: 'wait', args: {} }),
);
time('Player projection', () => projectPlayer(game.project, result.state));
if (!result.committed) throw new Error(result.error);
if (process.argv.includes('--write')) {
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/stress-project.json', JSON.stringify(project));
  console.log('Wrote test-results/stress-project.json for desktop profiling.');
}

import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { foldedHorizon, walkthrough } from '../examples/the-folded-horizon/sample';
import { exportGame } from '../packages/persistence/src/index';
const data = await mkdtemp(path.join(tmpdir(), 'elsewhen-packaged-')),
  game = path.join(data, 'sample.elsegame');
await writeFile(game, exportGame(foldedHorizon()));
const application = await electron.launch({
  executablePath: path.resolve('release/win-unpacked/ElseWhen.exe'),
  args: [game, '--proxy-server=http://127.0.0.1:9', '--host-resolver-rules=MAP * ~NOTFOUND'],
  env: { ...process.env, OPENAI_API_KEY: '', ELSEWHEN_TEST_DATA: data },
});
try {
  const page = await application.firstWindow(),
    errors: string[] = [];
  const requests: string[] = [];
  await application.context().route(/^https?:/, (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByRole('heading', { name: 'Nexus', exact: true })).toBeVisible();
  for (const command of walkthrough) {
    await page.getByRole('textbox', { name: 'Enter command', exact: true }).fill(command);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.locator('.transcript-entry.command').last()).toHaveText(`›${command}`);
  }
  await expect(page.getByRole('heading', { name: 'The end', exact: true })).toBeVisible();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/packaged-player.png' });
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
  console.log(
    await application.evaluate(({ app }) => {
      return {
        version: app.getVersion(),
        packaged: app.isPackaged,
        asar: app.getAppPath().endsWith('app.asar'),
      };
    }),
  );
  console.log('PASS packaged .elsegame launch and complete walkthrough');
} finally {
  await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
}

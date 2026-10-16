import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import path from 'node:path';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { walkthrough } from '../../examples/the-folded-horizon/sample';
let app: ElectronApplication, page: Page, dataDir: string;
test.beforeEach(async () => {
  const userData = await mkdtemp(path.join(tmpdir(), 'elsewhen-e2e-'));
  dataDir = userData;
  app = await electron.launch({
    args: [path.resolve('out/main/index.js')],
    env: { ...process.env, ELSEWHEN_TEST_DATA: userData, ELECTRON_ENABLE_LOGGING: '1' },
  });
  page = await app.firstWindow();
  await expect(page.getByRole('button', { name: 'Create a world', exact: true })).toBeVisible();
});
test.afterEach(async () => {
  if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
});
async function sample() {
  await page.getByRole('button', { name: 'Explore the sample' }).click();
  await expect(page.getByRole('heading', { name: 'World map' })).toBeVisible();
}
async function add(kind: string, name: string) {
  await page.getByRole('button', { name: `Add ${kind}`, exact: true }).click();
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
}
async function command(input: string) {
  await page.getByRole('textbox', { name: 'Enter command', exact: true }).fill(input);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('.transcript-entry.command').last()).toHaveText(`›${input}`);
}
test('sample map, light/dark themes and the full adventure', async () => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await sample();
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + 30, bounds.y + 30);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 150, bounds.y + 75, { steps: 10 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Frame all locations', exact: true }).click();
  await page.getByRole('button', { name: 'Location Echo Dimension', exact: true }).click();
  await page.getByRole('button', { name: 'Move selected location', exact: true }).click();
  await expect(page.getByText('Drag an axis handle · Escape to finish')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-results/world-map-dark.png' });
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: 'test-results/world-map-light.png' });
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(
    page
      .getByRole('img', { name: '2D world graph' })
      .or(page.locator('svg[aria-label="2D world graph"]')),
  ).toBeVisible();
  await page.locator('.tree-item').filter({ hasText: 'Crystal Cavern' }).click();
  await expect(
    page.getByRole('heading', { name: 'Crystal Cavern', exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/location-editor.png' });
  await page.getByRole('button', { name: 'Playtest', exact: true }).first().click();
  for (const cmd of walkthrough) await command(cmd);
  await expect(page.getByRole('heading', { name: 'The end', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/playtest-ending.png' });
  await page.getByRole('button', { name: 'Game view', exact: true }).click();
  await page.screenshot({ path: 'test-results/player-view.png' });
  expect(errors).toEqual([]);
});
test('create, connect, save, reopen and play a blank world', async () => {
  await page.getByRole('button', { name: 'Create a world', exact: true }).click();
  await add('Locations', 'Second Place');
  await page.getByRole('button', { name: 'World Map', exact: true }).click();
  await page.getByRole('button', { name: 'Location The Beginning', exact: true }).click();
  await page.getByRole('button', { name: 'Connect selected location', exact: true }).click();
  await page.getByRole('button', { name: 'Location Second Place', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('From', { exact: true })).toHaveValue(
    (await dialog
      .getByLabel('From', { exact: true })
      .locator('option')
      .filter({ hasText: 'The Beginning' })
      .getAttribute('value')) ?? '',
  );
  await dialog.getByLabel('Name', { exact: true }).fill('Silver Door');
  await dialog.getByLabel('From', { exact: true }).selectOption({ label: 'The Beginning' });
  await dialog.getByLabel('Destination', { exact: true }).selectOption({ label: 'Second Place' });
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  const file = path.join(
    await mkdtemp(path.join(tmpdir(), 'elsewhen-project-')),
    'project.elsewhen.json',
  );
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, file);
  await page.evaluate(() => window.elsewhen.invoke('openProject', {}));
  await page.getByRole('button', { name: 'Playtest', exact: true }).first().click();
  await command('go silver door');
  await expect(page.getByRole('heading', { name: 'Playtest · Second Place' })).toBeVisible();
});

test('cancel closing and recover a never-saved draft after restart', async () => {
  await page.getByRole('button', { name: 'Create a world', exact: true }).click();
  await page.locator('.tree-item').filter({ hasText: 'The Beginning' }).click();
  await page
    .locator('.editor-form')
    .getByLabel('Name', { exact: true })
    .fill('Recovered Beginning');
  await expect
    .poll(async () => (await readdir(path.join(dataDir, 'recovery')).catch(() => [])).length)
    .toBeGreaterThan(0);
  await app.evaluate(({ dialog, BrowserWindow }) => {
    dialog.showMessageBox = async () => {
      (globalThis as typeof globalThis & { closePrompted: boolean }).closePrompted = true;
      return { response: 2, checkboxChecked: false };
    };
    BrowserWindow.getAllWindows()[0].close();
  });
  await expect
    .poll(() =>
      app.evaluate(
        () => (globalThis as typeof globalThis & { closePrompted: boolean }).closePrompted,
      ),
    )
    .toBe(true);
  await expect(
    page.getByRole('heading', { name: 'Recovered Beginning', exact: true }).first(),
  ).toBeVisible();
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  app = await electron.launch({
    args: [path.resolve('out/main/index.js')],
    env: { ...process.env, ELSEWHEN_TEST_DATA: dataDir },
  });
  page = await app.firstWindow();
  await expect(page.getByText('RECOVER UNSAVED WORK')).toBeVisible();
  await page
    .locator('.recent-projects')
    .getByRole('button')
    .filter({ hasText: 'Untitled World' })
    .click();
  await expect(page.locator('.tree-item').filter({ hasText: 'Recovered Beginning' })).toBeVisible();
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
});
test('create a container through forms and take its contents', async () => {
  await page.getByRole('button', { name: 'Create a world', exact: true }).click();
  await add('Objects', 'Tin Box');
  await page.locator('.editor-form').getByLabel('Container', { exact: true }).check();
  await page.locator('.editor-form').getByLabel('Openable', { exact: true }).check();
  await add('Objects', 'Glass Bead');
  await page
    .locator('.editor-form')
    .getByLabel('Placement', { exact: true })
    .selectOption('inside');
  await page
    .locator('.editor-form')
    .getByLabel('Parent', { exact: true })
    .selectOption({ label: 'Tin Box' });
  await page.getByRole('button', { name: 'Playtest', exact: true }).first().click();
  await command('open tin box');
  await command('take glass bead');
  await expect(page.locator('.transcript')).toContainText('Taken: Glass Bead.');
});
test('edit a visual rule and inspect its committed effects', async () => {
  await sample();
  await page.locator('.tree-group.rules .tree-group-heading>button').first().click();
  await page.locator('.tree-item').filter({ hasText: 'Activate wormhole' }).click();
  await expect(page.getByText('WHEN', { exact: true })).toBeVisible();
  await page
    .getByLabel('Authored text', { exact: true })
    .fill('The violet seam opens. A new path awaits.');
  await page.screenshot({ path: 'test-results/rule-editor.png' });
  await page.getByRole('button', { name: 'Playtest', exact: true }).first().click();
  for (const cmd of ['go stone arch', 'take shard', 'go stone arch', 'use shard on anchor'])
    await command(cmd);
  await expect(page.locator('.transcript')).toContainText(
    'The violet seam opens. A new path awaits.',
  );
  await expect(page.locator('.trace-list')).toContainText('Activate wormhole');
  await expect(page.locator('.state-table')).toContainText('Active');
  await page.screenshot({ path: 'test-results/rule-playtest.png' });
});
test('export, open player package, save and restore', async () => {
  await sample();
  const dir = await mkdtemp(path.join(tmpdir(), 'elsewhen-export-')),
    gamePath = path.join(dir, 'horizon.elsegame'),
    savePath = path.join(dir, 'progress.elsesave');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, gamePath);
  await page.locator('.project-title').click();
  await page.getByRole('button', { name: 'Export game', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Game exported');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, gamePath);
  await page.locator('.brand').click();
  await page.getByRole('button', { name: 'Continue without saving' }).click();
  await page.getByRole('button', { name: 'Open a game', exact: true }).click();
  await command('take lantern');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, savePath);
  await page.getByRole('button', { name: 'Save game', exact: true }).click();
  await command('go stone arch');
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, savePath);
  await page.getByRole('button', { name: 'Load game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nexus', exact: true })).toBeVisible();
  for (const cmd of walkthrough.slice(1)) await command(cmd);
  await expect(page.getByRole('heading', { name: 'The end', exact: true })).toBeVisible();
});

test('scenario tests, debug changes and immutable playtest snapshots', async () => {
  await sample();
  await page.getByRole('button', { name: 'Story tests', exact: true }).click();
  await page.getByRole('button', { name: 'Run scenario', exact: true }).click();
  await expect(page.locator('.scenario-result h3')).toContainText('Passed');
  await expect(page.locator('.scenario-result h3')).toContainText('homeward');
  await page.getByRole('button', { name: 'Playtest', exact: true }).first().click();
  await page.getByText('Designer controls', { exact: true }).click();
  await page.getByLabel('Reference', { exact: true }).selectOption({ label: 'Crystal Cavern' });
  await page.getByRole('button', { name: 'Apply debug change', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Playtest · Crystal Cavern' })).toBeVisible();
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.locator('.tree-item').filter({ hasText: 'Nexus' }).first().click();
  await page.locator('.editor-form').getByLabel('Name', { exact: true }).fill('Nexus revised');
  await page.getByRole('button', { name: 'Resume playtest', exact: true }).click();
  await expect(page.locator('.snapshot-notice')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Playtest · Crystal Cavern' })).toBeVisible();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Playtest · Nexus revised' })).toBeVisible();
  await expect(page.locator('.snapshot-notice')).toHaveCount(0);
});

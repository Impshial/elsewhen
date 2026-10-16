import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir, cpus } from 'node:os';
import path from 'node:path';
const application = await electron.launch({
  args: [path.resolve('out/main/index.js')],
  env: {
    ...process.env,
    ELSEWHEN_TEST_DATA: await mkdtemp(path.join(tmpdir(), 'elsewhen-profile-')),
  },
});
try {
  const page = await application.firstWindow();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByRole('button', { name: 'Open project', exact: true })).toBeVisible();
  await application.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  }, path.resolve('test-results/stress-project.json'));
  const started = performance.now();
  await page.getByRole('button', { name: 'Open project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'World map' })).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.tree-group.locations .tree-item')).toHaveCount(100);
  const openMs = performance.now() - started;
  await expect(page.locator('canvas')).toBeVisible();
  const intervals = await page.evaluate<number[]>(
    'new Promise(resolve=>{ const values=[]; let last=performance.now(); function frame(now){values.push(now-last);last=now;if(values.length===21)resolve(values.slice(1).sort((a,b)=>a-b));else requestAnimationFrame(frame);} requestAnimationFrame(frame); })',
  );
  await page.screenshot({ path: 'test-results/stress-map.png' });
  const flatStart = performance.now();
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.locator('svg[aria-label="2D world graph"]')).toBeVisible({ timeout: 60000 });
  const flatMs = performance.now() - flatStart;
  const searchStart = performance.now();
  await page.getByLabel('Search project').fill('Object 4999');
  await expect(page.locator('.tree-item').filter({ hasText: 'Object 4999' })).toBeVisible();
  console.log(
    JSON.stringify(
      {
        cpu: cpus()[0].model,
        node: process.version,
        counts: { locations: 1000, connections: 3000, objects: 5000, rules: 1000 },
        openMs: Math.round(openMs),
        frameMedianMs: Math.round(intervals[10]),
        frame95Ms: Math.round(intervals[19]),
        switchTo2DMs: Math.round(flatMs),
        searchMs: Math.round(performance.now() - searchStart),
      },
      null,
      2,
    ),
  );
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
}

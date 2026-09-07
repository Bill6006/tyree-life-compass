import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function start(page: Page, block: 'Morning' | 'Afternoon' | 'Evening') {
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: block, exact: true }).click();
  await page.getByRole('button', { name: `Start ${block.toLowerCase()} check-in` }).click();
  await expect(page.getByRole('heading', { name: 'Mood', exact: true })).toBeVisible();
}
async function choose(page: Page, label: string, index: number | null) {
  await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
  const group = page.getByRole('group', { name: label, exact: true });
  await expect(group.getByRole('button')).toHaveCount(5);
  if (index === null) await page.getByRole('button', { name: 'Skip this reading' }).click();
  else await group.getByRole('button').nth(index).click();
}
async function five(page: Page, values: (number | null)[] = [2, 2, 2, 2, 2]) {
  for (const [i, label] of ['Mood', 'Irritation', 'Energy', 'Hunger', 'Stress'].entries()) await choose(page, label, values[i]);
}
async function save(page: Page, correction = false) {
  await page.getByRole('button', { name: correction ? 'Save correction' : 'Save check-in', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your saved reading' })).toBeVisible();
}
test('morning returns a fixed score, original phrases, and timestamped context with accessible controls', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./'); await start(page, 'Morning');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('morning-question.png'), fullPage: true });
  for (const label of ['Mood', 'Irritation', 'Stress', 'Overwhelm', 'Motivation', 'Confidence', 'Focus', 'Loneliness', 'Social energy', 'Energy', 'Hunger', 'Sleep duration', 'Sleep quality']) await choose(page, label, 2);
  await expect(page.getByText('13 of 13 readings picked.', { exact: false })).toBeVisible();
  const started = Date.now(); await save(page);
  await expect(page.getByRole('heading', { name: '50 / 100', exact: true })).toBeVisible();
  await testInfo.attach('result-display-time-ms', { body: String(Date.now() - started), contentType: 'text/plain' });
  await expect(page.getByText('Your first reference point.', { exact: false })).toBeVisible();
  await page.getByText('Recorded · your phrases', { exact: true }).click();
  await expect(page.getByText('Flat — nothing wrong, nothing good', { exact: true })).toBeVisible();
  await expect(page.getByText('Much of the night — 6 to under 7 hours', { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByText('Recorded · your phrases', { exact: true }).click();
  await page.getByText('Recorded · context alongside this reading', { exact: true }).click();
  await expect(page.getByText('Much of the night — 6 to under 7 hours', { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByText('Recorded · context alongside this reading', { exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('first-result.png'), fullPage: true });
  expect(errors).toEqual([]);
});
test('a missing core answer shows incomplete, keeps the prior complete timestamp, and compares matching phrases', async ({ page }) => {
  await page.goto('./'); await start(page, 'Afternoon'); await five(page, [4, 0, 4, 4, 0]); await save(page);
  await expect(page.getByRole('heading', { name: '100 / 100', exact: true })).toBeVisible();
  await start(page, 'Evening'); await five(page, [2, 0, 4, 0, null]); await save(page);
  await expect(page.getByRole('heading', { name: 'Incomplete', exact: true })).toBeVisible();
  await expect(page.getByText('Last complete reading: 100 / 100', { exact: false })).toBeVisible();
  await expect(page.getByText('Joyful → Flat', { exact: true })).toBeVisible();
  await expect(page.getByText('Not logged: stress.', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Readings', exact: true }).click();
  await expect(page.getByText('Recorded · 2 saved check-ins')).toBeVisible();
});
test('an interrupted check-in resumes offline without replacing prior answers or transmitting them', async ({ page, context, baseURL }) => {
  const outside: string[] = [];
  page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(baseURL!).origin) outside.push(request.url()); });
  await page.goto('./'); await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
  await start(page, 'Evening'); await choose(page, 'Mood', 0); await choose(page, 'Irritation', 0);
  await expect(page.getByRole('heading', { name: 'Energy', exact: true })).toBeVisible();
  await context.setOffline(true); await page.reload();
  await page.getByRole('button', { name: 'Resume check-in' }).click();
  await choose(page, 'Energy', 0); await choose(page, 'Hunger', 2); await choose(page, 'Stress', 0);
  await save(page); await expect(page.getByRole('heading', { name: '50 / 100', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '50 / 100', exact: true })).toBeVisible();
  await page.getByText('Recorded · your phrases', { exact: true }).click();
  await expect(page.getByText('Heavy — enjoyment feels far away', { exact: true })).toBeVisible();
  expect(outside).toEqual([]);
});
test('correction, deletion, and JSON restore preserve user control and do not duplicate records', async ({ page }) => {
  await page.goto('./'); await start(page, 'Evening'); await five(page); await save(page);
  await expect(page.getByRole('heading', { name: '50 / 100', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Readings', exact: true }).click();
  const exported = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const download = await exported; const path = await download.path();
  expect(path).toBeTruthy();
  await page.getByRole('button', { name: /Evening.*5 phrases/ }).click();
  await page.getByRole('button', { name: 'Correct this reading' }).click();
  await choose(page, 'Mood', 4);
  await page.getByRole('button', { name: 'Keep these answers' }).click(); await save(page, true);
  await expect(page.getByRole('heading', { name: '62.5 / 100', exact: true })).toBeVisible();
  await page.getByLabel('Restore a JSON backup').setInputFiles(path!);
  await page.getByRole('button', { name: 'Restore missing readings' }).click();
  await expect(page.getByText('Restored 0 readings. Kept 1 existing reading unchanged.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '62.5 / 100', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete this reading' }).click();
  await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();
  await expect(page.getByText('Recorded · 0 saved check-ins')).toBeVisible();
  await page.getByLabel('Restore a JSON backup').setInputFiles(path!);
  await page.getByRole('button', { name: 'Restore missing readings' }).click();
  await expect(page.getByText('Recorded · 1 saved check-in', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Evening.*5 phrases/ }).click();
  await expect(page.getByRole('heading', { name: '50 / 100', exact: true })).toBeVisible();
});
test('skipping everything creates no score or observation and can be discarded without a catch-up request', async ({ page }) => {
  await page.goto('./'); await start(page, 'Evening'); await five(page, [null, null, null, null, null]);
  await expect(page.getByRole('button', { name: 'Save check-in', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Return to Today' }).click();
  await expect(page.getByRole('heading', { name: 'Not logged yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
  await page.getByRole('button', { name: 'Discard unfinished answers', exact: true }).click();
  await expect(page.getByText('Draft discarded. Saved readings are unchanged.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /^Start .* check-in$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume check-in' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Readings', exact: true }).click();
  await expect(page.getByText('Recorded · 0 saved check-ins')).toBeVisible();
});
test('invalid restores change nothing and CSV downloads contain descriptive phrases', async ({ page }) => {
  await page.goto('./'); await start(page, 'Afternoon'); await choose(page, 'Mood', 2);
  await page.getByRole('button', { name: 'Keep these answers' }).click(); await save(page);
  await page.getByRole('link', { name: 'Readings', exact: true }).click();
  await page.getByLabel('Restore a JSON backup').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":99}') });
  await expect(page.getByText('This file is not a supported Life Compass backup. Nothing was changed.')).toBeVisible();
  await expect(page.getByText('Recorded · 1 saved check-in', { exact: true })).toBeVisible();
  const exported = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export CSV' }).click();
  const { readFile } = await import('node:fs/promises'); const csv = await readFile((await (await exported).path())!, 'utf8');
  expect(csv).toContain('Flat — nothing wrong, nothing good');
  expect(csv).toContain('"stress","Not logged yet",""');
});

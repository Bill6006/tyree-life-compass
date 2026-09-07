import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

async function open(page: Page) { await page.getByRole('link', { name: 'Becoming', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Becoming', exact: true })).toBeVisible(); }
async function add(page: Page, title = 'A chosen course', study = true) {
  await expect(page.getByText(/^My commitments ·/)).toBeVisible();
  if (await page.getByRole('button', { name: 'Choose a commitment', exact: true }).isVisible()) await page.getByRole('button', { name: 'Choose a commitment', exact: true }).click();
  else { await page.getByText(/^My commitments ·/).click(); await page.getByRole('button', { name: 'Add another commitment', exact: true }).click(); }
  await page.getByLabel('What matters to me', { exact: true }).fill(title);
  await page.getByLabel('My next small step', { exact: true }).fill('Read one practice question');
  await page.getByLabel('I can stop when', { exact: true }).fill('One answer is written');
  await page.getByLabel('This is study', { exact: true }).setChecked(study);
  await page.getByRole('button', { name: 'Keep this commitment', exact: true }).click();
  await expect(page.getByText('Commitment kept. Opening a step records no work.', { exact: true })).toBeVisible();
}
async function start(page: Page) { await page.getByRole('button', { name: 'I’m starting this sitting', exact: true }).click(); await expect(page.getByRole('button', { name: 'I reached my stopping point', exact: true })).toBeVisible(); }
async function activity(page: Page, kind: string, note = '') {
  await page.getByRole('button', { name: 'Record something I did', exact: true }).click();
  await page.getByRole('combobox', { name: 'What happened', exact: true }).selectOption(kind);
  await page.getByLabel('Optional note', { exact: true }).fill(note);
  await page.getByRole('button', { name: 'Record one activity', exact: true }).click();
  await expect(page.getByText('Activity recorded. Its date and count are yours to correct.', { exact: true })).toBeVisible();
}

test('a protected step survives offline returning and counts only explicitly recorded work', async ({ page, context }, info) => {
  await page.goto('./#/becoming'); await add(page);
  await page.getByRole('button', { name: 'Write my direction', exact: true }).click();
  await page.getByLabel('Who I’m becoming', { exact: true }).fill('I keep returning to what I choose.');
  await page.getByRole('button', { name: 'Save my direction', exact: true }).click();
  await expect(page.getByText('0 started · 0 finished', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your protected return', exact: true })).toContainText('One answer is written');
  await page.getByRole('link', { name: 'Return to this step', exact: false }).click();
  await expect(page.getByText('0 started · 0 finished', { exact: true })).toBeVisible();
  await start(page);
  await expect(page.getByText('1 started · 0 finished', { exact: true })).toBeVisible();
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
  await context.setOffline(true); await page.reload();
  await expect(page.getByText('Read one practice question', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText('1 started · 0 finished', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'I’m resuming study now', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Study resumption recorded', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'I reached my stopping point', exact: true }).click();
  await expect(page.getByText('1 started · 1 finished', { exact: true })).toBeVisible();
  await expect(page.getByText('I keep returning to what I choose.', { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('becoming-first-sitting.png'), fullPage: true });
});

test('adding another commitment and low-demand settings cannot replace the protected return', async ({ page }) => {
  await page.goto('./#/becoming'); await add(page, 'My protected course'); await add(page, 'Another chosen commitment', false);
  await page.getByRole('link', { name: 'Settings', exact: true }).click(); await page.getByRole('button', { name: 'Use low-demand mode', exact: true }).click();
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your protected return', exact: true })).toContainText('My protected course');
  await expect(page.getByRole('region', { name: 'Your protected return', exact: true })).not.toContainText('Another chosen commitment');
  await open(page); await page.getByText('My commitments · 2', { exact: true }).click();
  const other = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Another chosen commitment', exact: true }) });
  await other.getByRole('button', { name: 'Open this step', exact: true }).click();
  await page.getByRole('button', { name: 'Protect this return', exact: true }).click();
  await expect(page.getByText('Protected return changed by your choice.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your protected return', exact: true })).toContainText('Another chosen commitment');
});

test('activity dates, direction deletion, and optional faith records remain under direct control', async ({ page }, info) => {
  await page.goto('./#/becoming'); await activity(page, 'daughter-time', 'Time together, no lesson');
  await page.getByText('Activity records · 1', { exact: true }).click();
  await page.getByRole('button', { name: 'Correct activity', exact: true }).click();
  await page.getByLabel('Activity date', { exact: true }).fill('2026-01-01');
  await page.getByRole('button', { name: 'Save activity correction', exact: true }).click();
  await page.getByText('Activity records · 1', { exact: true }).click();
  await expect(page.getByText('Jan 1, 2026 · 1 recorded', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete activity', exact: true }).click(); await page.getByRole('button', { name: 'Delete record permanently', exact: true }).click();
  await expect(page.getByText('Activity records · 0', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Write my direction', exact: true }).click(); await page.getByLabel('Who I’m becoming', { exact: true }).fill('A line I can change.');
  await page.getByRole('button', { name: 'Save my direction', exact: true }).click(); await page.getByRole('button', { name: 'Edit my direction', exact: true }).click();
  await page.getByLabel('Who I’m becoming', { exact: true }).fill(''); await page.getByRole('button', { name: 'Save my direction', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Write my direction', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Record something I did', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Faith practices I chose', exact: true })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('becoming-activity-form.png'), fullPage: true });
  await page.getByRole('button', { name: 'Cancel edit', exact: true }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).click(); await page.getByRole('button', { name: /^Faith reflection/ }).click();
  await open(page); await activity(page, 'faith');
  await page.getByText('Planning preferences', { exact: true }).click();
  await page.getByLabel('Keep Saturday in mind for church', { exact: true }).uncheck();
  await expect(page.getByText('Planning preference saved. No attendance was recorded.', { exact: true })).toBeVisible();
  await expect(page.getByText('Activity records · 1', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Settings', exact: true }).click(); await page.getByRole('button', { name: /^Faith reflection/ }).click(); await open(page);
  await expect(page.getByText('Faith practices I chose', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Activity records · 0', { exact: true })).toBeVisible();
});

test('sitting corrections remove a finish and deletion removes its count and linked study resumption', async ({ page }) => {
  await page.goto('./#/becoming'); await add(page); await start(page);
  await page.getByRole('button', { name: 'I’m resuming study now', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Study resumption recorded', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'I reached my stopping point', exact: true }).click();
  await expect(page.getByText('1 started · 1 finished', { exact: true })).toBeVisible();
  await page.getByText('Sitting records · 1', { exact: true }).click();
  await page.getByRole('button', { name: 'Correct sitting', exact: true }).click();
  await page.getByLabel('A finish was recorded', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save sitting correction', exact: true }).click();
  await expect(page.getByText('1 started · 0 finished', { exact: true })).toBeVisible();
  await page.getByText('Sitting records · 1', { exact: true }).click();
  await page.getByRole('button', { name: 'Delete sitting', exact: true }).click(); await page.getByRole('button', { name: 'Delete record permanently', exact: true }).click();
  await expect(page.getByText('0 started · 0 finished', { exact: true })).toBeVisible();
  await expect(page.getByText('Activity records · 0', { exact: true })).toBeVisible();
  await expect(page.getByText('My commitments · 1', { exact: true })).toBeVisible();
});

test('Becoming backup restores complete records once and keeps private data off exports and the network', async ({ page, baseURL }) => {
  const outside: string[] = []; page.on('request', (r) => { if (!r.url().startsWith('blob:') && new URL(r.url()).origin !== new URL(baseURL!).origin) outside.push(r.url()); });
  await page.goto('./#/becoming'); await add(page); await start(page); await activity(page, 'conversation', '=1+1');
  await page.getByText('Keep a Becoming backup', { exact: true }).click();
  const exported = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export Becoming JSON', exact: true }).click(); const path = (await (await exported).path())!;
  const backup = JSON.parse(await readFile(path, 'utf8')); expect(backup.commitments).toHaveLength(1); expect(backup.sittings).toHaveLength(1); expect(backup.activities).toHaveLength(1);
  expect(JSON.stringify(backup)).not.toMatch(/privateItems|privateEntries|privateEnabled/);
  const csvEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export Becoming CSV', exact: true }).click();
  expect(await readFile((await (await csvEvent).path())!, 'utf8')).toContain("'=1+1");
  await page.getByText('My commitments · 1', { exact: true }).click(); await page.getByRole('button', { name: 'Delete commitment', exact: true }).click(); await page.getByRole('button', { name: 'Delete record permanently', exact: true }).click();
  await expect(page.getByText('My commitments · 0', { exact: true })).toBeVisible();
  await page.getByLabel('Restore a Becoming JSON backup', { exact: true }).setInputFiles(path);
  await page.getByLabel('Also restore my direction, protected choice, and planning preferences', { exact: true }).check();
  await page.getByRole('button', { name: 'Restore missing Becoming records', exact: true }).click();
  await expect(page.getByText('Restored 2 missing Becoming records. Existing records kept.', { exact: true })).toBeVisible();
  await expect(page.getByText('1 started · 0 finished', { exact: true })).toBeVisible();
  await page.getByLabel('Restore a Becoming JSON backup', { exact: true }).setInputFiles(path); await page.getByRole('button', { name: 'Restore missing Becoming records', exact: true }).click();
  await expect(page.getByText('Restored 0 missing Becoming records. Existing records kept.', { exact: true })).toBeVisible();
  expect(outside).toEqual([]);
});

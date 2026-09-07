import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';

async function fixture(page: Page) {
  const dates = await page.evaluate(() => [0, -1, -6, -20].map((offset) => {
    const day = new Date(); day.setDate(day.getDate() + offset); day.setHours(8, 0, 0, 0); return day.toISOString();
  }));
  const checkIns = [
    { at: dates[0], block: 'morning', answers: { mood: 0, energy: 0, irritation: 4, stress: 4, sleepDuration: 3 } },
    { at: new Date(Date.parse(dates[0]) + 6 * 3600000).toISOString(), block: 'afternoon', answers: { mood: 2, energy: 2, irritation: 2, stress: 2 } },
    { at: new Date(Date.parse(dates[0]) + 12 * 3600000).toISOString(), block: 'evening', answers: { mood: 4 } },
    { at: dates[1], block: 'morning', answers: { mood: 4, energy: 4, irritation: 0, stress: 0, sleepDuration: 1 } },
    { at: dates[2], block: 'morning', answers: { mood: 1, energy: 1, irritation: 2, stress: 2 } },
    { at: dates[3], block: 'morning', answers: { mood: 2, energy: 3, irritation: 2, stress: 2 } },
  ].map(({ at, ...rest }) => ({ ...rest, id: randomUUID(), occurredAt: at, reportedAt: at, updatedAt: at, answeringMs: 2000, definitionVersion: 1, scoreVersion: 'core-four-v1' }));
  await page.getByRole('link', { name: 'Readings', exact: true }).click();
  await page.getByLabel('Restore a JSON backup', { exact: true }).setInputFiles({ name: 'synthetic-mirror.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'tyree-life-compass', schemaVersion: 2, exportedAt: new Date().toISOString(), checkIns, draft: null })) });
  await page.getByRole('button', { name: 'Restore missing readings', exact: true }).click();
  await expect(page.getByText('Restored 6 readings. Kept 0 existing readings unchanged.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Mirror', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Today’s trace', exact: true })).toBeVisible();
}
const trace = (page: Page) => page.getByRole('region', { name: 'Today’s trace', exact: true });
const heatmap = (page: Page) => page.getByRole('region', { name: 'Four weeks, at a glance', exact: true });
const relation = (page: Page) => page.getByRole('region', { name: 'Readings together', exact: true });

test('empty mirror leaves all dates empty and fits a narrow accessible phone screen', async ({ page }, info) => {
  await page.goto('./#/mirror');
  await expect(trace(page).getByText('0 points', { exact: true })).toBeVisible();
  await expect(heatmap(page).getByRole('button', { name: /Not logged yet; 0 complete, 0 incomplete/ })).toHaveCount(28);
  await expect(relation(page).getByText('Recorded · 0 paired check-ins across 0 days', { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const sizes = await page.getByRole('navigation').getByRole('link').evaluateAll((links) => links.map((l) => ({ width: l.getBoundingClientRect().width, height: l.getBoundingClientRect().height })));
  expect(sizes.every((size) => size.width >= 44 && size.height >= 44)).toBe(true);
  await page.screenshot({ path: info.outputPath('mirror-empty-narrow.png'), fullPage: true });
});

test('today, week and heatmap expose complete, incomplete and missing observations with exact values', async ({ page }, info) => {
  await page.goto('./'); await fixture(page);
  await expect(trace(page).getByText('2 points', { exact: true })).toBeVisible();
  await expect(trace(page).locator('.chart-point')).toHaveCount(2);
  await expect(trace(page).locator('.chart-missing')).toHaveCount(1);
  await expect(heatmap(page).getByText('Mean 25 / 100', { exact: true })).toBeVisible();
  await expect(heatmap(page).getByText('2 complete · 1 incomplete · 3 saved check-ins', { exact: true })).toBeVisible();
  await heatmap(page).getByText('Scores recorded on this day', { exact: true }).click();
  for (const value of ['0 / 100', '50 / 100', 'Incomplete']) await expect(heatmap(page).getByRole('list', { name: 'Day scores', exact: true }).getByText(value, { exact: true })).toBeVisible();
  await heatmap(page).getByText('Scores recorded on this day', { exact: true }).click();
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  const week = page.getByRole('region', { name: 'The last seven days', exact: true });
  await expect(week.getByText('4 points', { exact: true })).toBeVisible();
  await week.getByText('Trace records · 5 saved check-ins', { exact: true }).click();
  await expect(week.getByText(/· Not logged yet$/, { exact: false })).toHaveCount(4);
  await week.getByText('Trace records · 5 saved check-ins', { exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('mirror-week-populated.png'), fullPage: true });
  await page.getByRole('combobox', { name: 'Trace reading', exact: true }).selectOption('sleepDuration');
  await expect(week.getByText('2 points', { exact: true })).toBeVisible();
  await week.getByText('Trace records · 5 saved check-ins', { exact: true }).click();
  await expect(week.getByRole('list', { name: 'Trace records', exact: true }).getByText('A long stretch — 7 to under 9 hours', { exact: true })).toBeVisible();
  await expect(heatmap(page).getByText('Mean 25 / 100', { exact: true })).toBeVisible();
  await heatmap(page).getByText('Scores recorded on this day', { exact: true }).click();
  await expect(heatmap(page).getByRole('list', { name: 'Day scores', exact: true }).getByText('50 / 100', { exact: true })).toBeVisible();
});

test('relationships show paired counts, omit unanswered readings and label the limits of the calculation', async ({ page }, info) => {
  await page.goto('./'); await fixture(page);
  await expect(relation(page).getByText('Recorded · 5 paired check-ins across 4 days', { exact: true })).toBeVisible();
  await expect(relation(page).getByText(/^1 saved check-in in this time filter lacks/)).toBeVisible();
  await expect(relation(page).getByText(/^Association, not causation\./)).toBeVisible();
  await expect(relation(page).getByText(/^Rank association \+/)).toBeVisible();
  await relation(page).getByText('Inspect paired answers', { exact: true }).click();
  await expect(relation(page).getByRole('list', { name: 'Paired answers', exact: true }).getByRole('listitem')).toHaveCount(5);
  await page.getByRole('combobox', { name: 'Second reading', exact: true }).selectOption('focus');
  await expect(relation(page).getByText('Recorded · 0 paired check-ins across 0 days', { exact: true })).toBeVisible();
  await expect(relation(page).getByText(/^Rank association/)).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Second reading', exact: true }).selectOption('energy');
  await page.getByRole('combobox', { name: 'Time filter', exact: true }).selectOption('afternoon');
  await expect(relation(page).getByText('Recorded · 1 paired check-in across 1 day', { exact: true })).toBeVisible();
  await expect(relation(page).getByText('A few more reference points', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Time filter', exact: true }).selectOption('morning');
  await expect(relation(page).getByText('Recorded · 4 paired check-ins across 4 days', { exact: true })).toBeVisible();
  await relation(page).getByText('How to read this', { exact: true }).click();
  await expect(relation(page).getByText(/Some findings take months; some remain uncertain\./)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('mirror-relationship.png'), fullPage: true });
});

test('correction and deletion update the mirror and its empty state without keeping old calculations', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Evening', exact: true }).click(); await page.getByRole('button', { name: 'Start evening check-in', exact: true }).click();
  for (const label of ['Mood', 'Irritation', 'Energy', 'Hunger', 'Stress']) await page.getByRole('group', { name: label, exact: true }).getByRole('button').nth(2).click();
  await page.getByRole('button', { name: 'Save check-in', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your saved reading' })).toBeVisible();
  await page.getByRole('link', { name: 'Mirror', exact: true }).click();
  await expect(heatmap(page).getByText('Mean 50 / 100', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Readings', exact: true }).click();
  await page.getByRole('button', { name: /Evening.*5 phrases/ }).click();
  await page.getByRole('button', { name: 'Correct this reading', exact: true }).click();
  await page.getByRole('group', { name: 'Mood', exact: true }).getByRole('button').nth(4).click();
  await page.getByRole('button', { name: 'Keep these answers', exact: true }).click();
  await page.getByRole('button', { name: 'Save correction', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your saved reading' })).toBeVisible();
  await page.getByRole('link', { name: 'Mirror', exact: true }).click();
  await expect(heatmap(page).getByText('Mean 62.5 / 100', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Readings', exact: true }).click();
  await page.getByRole('button', { name: /Evening.*5 phrases/ }).click();
  await page.getByRole('button', { name: 'Delete this reading', exact: true }).click();
  await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();
  await expect(page.getByText('Recorded · 0 saved check-ins', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Mirror', exact: true }).click();
  await expect(trace(page).getByText('0 points', { exact: true })).toBeVisible();
  await expect(relation(page).getByText('Recorded · 0 paired check-ins across 0 days', { exact: true })).toBeVisible();
  await expect(heatmap(page).getByRole('button', { name: /Not logged yet; 0 complete, 0 incomplete/ })).toHaveCount(28);
});

test('the mirror works offline and private opt-in does not add content or network requests to it', async ({ page, context, baseURL }) => {
  const outside: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith('blob:') && new URL(r.url()).origin !== new URL(baseURL!).origin) outside.push(r.url()); });
  await page.goto('./'); await fixture(page);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /^Private logging/ }).click();
  await page.getByLabel('Name a private item', { exact: true }).fill('Private synthetic marker');
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await expect(page.getByText('Item saved.', { exact: true })).toBeVisible();
  await page.getByRole('group', { name: 'Private synthetic marker', exact: true }).getByRole('button', { name: 'Happened', exact: true }).click();
  await expect(page.getByText('Private entry saved on this device.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Mirror', exact: true }).click();
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
  await context.setOffline(true); await page.reload();
  await expect(heatmap(page).getByText('Mean 25 / 100', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.getByRole('region', { name: 'The last seven days', exact: true }).getByText('4 points', { exact: true })).toBeVisible();
  await expect(page.getByText('Private synthetic marker', { exact: false })).toHaveCount(0);
  expect(outside).toEqual([]);
});

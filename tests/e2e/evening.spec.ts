import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

async function openSettings(page: Page) { await page.getByRole('link', { name: 'Settings', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible(); }
async function begin(page: Page, block = 'Evening') { await page.getByRole('link', { name: 'Today', exact: true }).click(); await page.getByRole('button', { name: block, exact: true }).click(); await page.getByRole('button', { name: `Start ${block.toLowerCase()} check-in` }).click(); }
async function five(page: Page) { for (const label of ['Mood','Irritation','Energy','Hunger','Stress']) { await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible(); await page.getByRole('group', { name: label, exact: true }).getByRole('button').nth(2).click(); } }
async function extras(page: Page) { await page.getByText('Optional · end the day gently', { exact: true }).click(); }
async function chip(page: Page, group: string, name: string) { await page.getByRole('group', { name: group, exact: true }).getByRole('button', { name, exact: true }).click(); }
async function save(page: Page) { await page.getByRole('button', { name: 'Save check-in', exact: true }).click(); await expect(page.getByRole('heading', { name: '50 / 100', exact: true })).toBeVisible(); }

test('depth and frequency are independent, low-demand survives reopening, and usual settings return', async ({ page }, info) => {
  await page.goto('./'); await openSettings(page);
  await page.getByRole('button', { name: 'Twice a day Morning and evening', exact: true }).click();
  await page.getByRole('button', { name: 'Use low-demand mode', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Brief 5 readings at any time', exact: true })).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button', { name: 'Once a day Evening', exact: true })).toHaveAttribute('aria-pressed','true');
  await page.reload(); await expect(page.getByText('Your usual choice: Standard · 2 planned daily.', { exact: false })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('lighter-settings.png'), fullPage: true });
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Evening', exact: true })).toHaveAttribute('aria-pressed','true');
  await openSettings(page); await page.getByRole('button', { name: 'Restore my usual settings' }).click();
  await expect(page.getByRole('button', { name: 'Standard 13 morning readings · 5 later', exact: true })).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button', { name: 'Twice a day Morning and evening', exact: true })).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button', { name: 'Brief 5 readings at any time', exact: true }).click();
  await begin(page, 'Morning'); await five(page); await save(page);
  await openSettings(page);
  await expect(page.getByRole('button', { name: 'Twice a day Morning and evening', exact: true })).toHaveAttribute('aria-pressed','true');
});
test('evening extras survive an offline interruption, keep no distinct from silence, and reuse the chosen line', async ({ page, context }, info) => {
  await page.goto('./'); await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
  await begin(page); await five(page); await extras(page);
  await page.getByLabel('Tomorrow’s minimum win', { exact: true }).fill('Resume one test page');
  await chip(page, 'Caffeine after midday?', 'No');
  await expect(page.getByRole('button', { name: 'Save check-in', exact: true })).toBeEnabled();
  await context.setOffline(true); await page.reload(); await page.getByRole('button', { name: 'Resume check-in' }).click();
  await expect(page.getByLabel('Tomorrow’s minimum win', { exact: true })).toHaveValue('Resume one test page');
  await expect(page.getByRole('group', { name: 'Caffeine after midday?', exact: true }).getByRole('button', { name: 'No', exact: true })).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('group', { name: 'Late or heavy dinner?', exact: true }).getByRole('button', { name: 'Not logged', exact: true })).toHaveAttribute('aria-pressed','true');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('evening-extras.png'), fullPage: true });
  await save(page); await page.getByText('Recorded · evening extras', { exact: true }).click();
  await expect(page.getByText('Resume one test page', { exact: true })).toBeVisible();
  await begin(page); await five(page); await extras(page);
  await page.getByRole('button', { name: 'Reuse last: Resume one test page', exact: true }).click();
  await expect(page.getByLabel('Tomorrow’s minimum win', { exact: true })).toHaveValue('Resume one test page');
  await expect(page.getByRole('group', { name: 'Caffeine after midday?', exact: true }).getByRole('button', { name: 'Not logged', exact: true })).toHaveAttribute('aria-pressed','true');
});
test('faith requires opting in and its one-tap off control removes the question and saved-answer display', async ({ page }) => {
  await page.goto('./'); await begin(page); await five(page);
  await expect(page.getByText('Felt close to God today?', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Return to Today' }).click();
  await openSettings(page); await page.getByRole('button', { name: /^Faith reflection/ }).click();
  await page.getByRole('link', { name: 'Today', exact: true }).click(); await page.getByRole('button', { name: 'Resume check-in' }).click();
  await chip(page, 'Felt close to God today?', 'Yes');
  await page.getByRole('button', { name: 'Turn off this question', exact: true }).click();
  await expect(page.getByText('Felt close to God today?', { exact: true })).toHaveCount(0);
  await save(page); await page.getByText('Recorded · evening extras', { exact: true }).click();
  await expect(page.getByText('Felt close to God today', { exact: true })).toHaveCount(0);
  await openSettings(page); await expect(page.getByRole('button', { name: /^Faith reflection/ })).toHaveAttribute('aria-pressed','false');
});
test('private names and entries hide completely and never appear in ordinary exports or off-origin requests', async ({ page, baseURL }) => {
  const outside: string[] = []; page.on('request', (r) => { if (!r.url().startsWith('blob:') && new URL(r.url()).origin !== new URL(baseURL!).origin) outside.push(r.url()); });
  await page.goto('./'); await openSettings(page); await page.getByRole('button', { name: /^Private logging/ }).click();
  await page.getByLabel('Name a private item', { exact: true }).fill('Private test item'); await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await expect(page.getByText('Item saved.', { exact: true })).toBeVisible();
  await begin(page); await five(page); await chip(page, 'Private test item', 'Did not happen');
  await expect(page.getByText('Private entry saved on this device.', { exact: true })).toBeVisible();
  await save(page); await openSettings(page);
  await expect(page.getByRole('group', { name: 'Private test item', exact: true }).getByRole('button', { name: 'Did not happen', exact: true })).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button', { name: /^Private logging/ }).click();
  await expect(page.getByText('Private test item', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Readings', exact: true }).click();
  for (const extension of ['JSON','CSV']) {
    const promise = page.waitForEvent('download'); await page.getByRole('button', { name: `Export ${extension}`, exact: true }).click();
    const content = await readFile((await (await promise).path())!, 'utf8');
    expect(content).not.toMatch(/Private test item|privateEnabled|privateItems|privateEntries|occurred"/);
  }
  await openSettings(page); await page.getByRole('button', { name: /^Private logging/ }).click();
  await expect(page.getByRole('group', { name: 'Private test item', exact: true }).getByRole('button', { name: 'Did not happen', exact: true })).toHaveAttribute('aria-pressed','true');
  expect(outside).toEqual([]);
});
test('private export and restore are explicit, and item deletion removes its entries', async ({ page }) => {
  await page.goto('./'); await openSettings(page); await page.getByRole('button', { name: /^Private logging/ }).click();
  await page.getByLabel('Name a private item', { exact: true }).fill('Private test item'); await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await chip(page, 'Private test item', 'Happened'); await expect(page.getByText('Private entry saved on this device.', { exact: true })).toBeVisible();
  const promise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export private JSON', exact: true }).click(); const path = (await (await promise).path())!;
  const backup = JSON.parse(await readFile(path, 'utf8')); expect(backup.items[0].name).toBe('Private test item'); expect(backup.entries[0].occurred).toBe(true);
  await page.getByRole('button', { name: 'Delete item', exact: true }).click(); await page.getByRole('button', { name: 'Delete item and entries', exact: true }).click();
  await expect(page.getByText('Item and entries deleted.', { exact: true })).toBeVisible(); await expect(page.getByText('Private test item', { exact: true })).toHaveCount(0);
  await page.getByLabel('Restore a private JSON backup', { exact: true }).setInputFiles(path); await page.getByRole('button', { name: 'Restore missing private entries', exact: true }).click();
  await expect(page.getByText('Private backup restored; existing entries kept.', { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Private test item', exact: true }).getByRole('button', { name: 'Happened', exact: true })).toHaveAttribute('aria-pressed','true');
  await chip(page, 'Private test item', 'Not logged'); await expect(page.getByText('Entry removed. This day is not logged for that item.', { exact: true })).toBeVisible();
});
test('quiet hours omit planned alarms and none planned still permits an intentional check-in', async ({ page }) => {
  await page.goto('./'); await openSettings(page);
  await page.getByLabel('Quiet from', { exact: true }).fill('20:00');
  await expect(page.getByLabel('Planned alarm times')).not.toContainText('Evening');
  await expect(page.getByLabel('Planned alarm times')).toContainText('Morning · 08:00');
  await page.getByRole('button', { name: 'Use low-demand mode', exact: true }).click();
  await expect(page.getByText('No alarms in this plan.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore my usual settings', exact: true }).click();
  await page.getByRole('button', { name: 'None planned Open whenever you choose', exact: true }).click();
  await page.getByRole('link', { name: 'Today', exact: true }).click(); await expect(page.getByRole('button', { name: /^Start .* check-in$/ })).toBeEnabled();
});

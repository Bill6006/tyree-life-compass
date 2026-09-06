import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('opens a truthful empty reading, offers installation help, and stays accessible', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Not logged yet' })).toBeVisible();
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Install app' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('today.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('the manifest is installable under the Pages subpath and has real PNG icons', async ({ request }) => {
  const response = await request.get('manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.start_url).toBe('/tyree-life-compass/');
  expect(manifest.scope).toBe('/tyree-life-compass/');
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.ok()).toBe(true);
    const png = await response.body();
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    const width = png.readUInt32BE(16);
    expect(icon.sizes).toBe(`${width}x${png.readUInt32BE(20)}`);
  }
});

test('reopens offline, keeps About available, and sends no off-origin requests', async ({ page, context, baseURL }, testInfo) => {
  const offOrigin: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(baseURL!).origin) offOrigin.push(request.url());
  });
  await page.goto('./');
  await expect(page.getByText('Ready offline', { exact: true })).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.getByRole('link', { name: 'About', exact: true }).click();
  await expect(page.getByText('Ready on this device', { exact: true })).toBeVisible();
  await expect(page.getByText('Deployment fingerprint', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'About this app' })).toBeVisible();
  await expect(page.getByText('Ready on this device', { exact: true })).toBeVisible();
  await expect(page.getByText('You’re offline', { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('about-offline.png'), fullPage: true });
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Not logged yet' })).toBeVisible();
  expect(offOrigin).toEqual([]);
});

test('About identifies the same source and manifest as the compiled artifact', async ({ page, request }) => {
  const info = await (await request.get('build-info.json')).json();
  const evidence = await (await request.get('artifact-manifest.json')).json();
  expect(evidence.build).toEqual(info);
  await page.goto('./#/about');
  await expect(page.getByText(info.commit === 'local-development' ? 'Local preview' : info.commit.slice(0, 12), { exact: true })).toBeVisible();
  await page.getByText('Deployment fingerprint', { exact: true }).click();
  const manifestBytes = await (await request.get('artifact-manifest.json')).body();
  const { createHash } = await import('node:crypto');
  const fingerprint = createHash('sha256').update(manifestBytes).digest('hex');
  await expect(page.getByText(fingerprint, { exact: true })).toBeVisible();
});

test('installation fallback explains the actual Android steps without inventing success', async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener('beforeinstallprompt', (event) => event.stopImmediatePropagation());
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Install app' }).click();
  await expect(page.getByText('On Android, open this link in Chrome.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A place on your home screen' })).toHaveCount(0);
});

test('an actual installed event changes the installation controls', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.getByRole('heading', { name: 'A place on your home screen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Install app' })).toHaveCount(0);
});

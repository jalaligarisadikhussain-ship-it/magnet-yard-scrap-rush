import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined),
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-first-run', '--disable-extensions']
});
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(()=>document.getElementById('playGame')?.click());
  await page.locator('#game canvas').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);
  const defaultWidth = await page.locator('#game canvas').evaluate(el => el.width);
  assert(defaultWidth > 390, 'Default Balanced should use higher than 1x pixel ratio on 2x screen');
  await page.locator('#pause').click();
  await page.locator('#quality').selectOption('eco');
  const ecoWidth = await page.locator('#game canvas').evaluate(el => el.width);
  assert.equal(ecoWidth, 390, 'Eco should use 1x resolution on mobile');
  await page.locator('#quality').selectOption('crisp');
  const crispWidth = await page.locator('#game canvas').evaluate(el => el.width);
  assert(crispWidth > ecoWidth, 'Crisp should render at higher resolution than Eco');
  await page.locator('#quality').selectOption('eco');

  // Simulate existing saved progress in this isolated browser context.
  await page.evaluate(() => {
    const key = 'magnet-yard-scrap-rush-save-v1';
    const saved = JSON.parse(localStorage.getItem(key));
    saved.coins = 321;
    saved.levels.radius = 2;
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(()=>document.getElementById('playGame')?.click());
  await page.locator('#game canvas').waitFor({ timeout: 15000 });
  await page.waitForTimeout(350);
  assert.equal((await page.locator('#coins').innerText()).replace(/,/g, ''), '321', 'Saved coins must survive refresh');
  await page.locator('#pause').click();
  assert.equal(await page.locator('#quality').inputValue(), 'eco', 'Quality choice persists across refresh');
  assert.equal(await page.locator('#game canvas').evaluate(el => el.width), 390, 'Eco pixel ratio restored on refresh');
  await page.locator('#resume').click();
  await page.locator('#upgrades').click();
  assert.match(await page.locator('#shopItems').innerText(), /LV 2\/5/, 'Existing upgrade levels must survive refresh');
  await page.locator('#closeShop').click();
  await page.screenshot({ path: 'qa-v05-mobile-quality.png' });
  assert.deepEqual(errors, [], 'No uncaught mobile browser errors allowed');
  console.log('PASS: 390x844 mobile Eco/Balanced/Crisp adjusts canvas resolution.');
  console.log('PASS: graphics quality, coins and upgrade progress survive refresh.');
  console.log('Canvas widths:', { defaultWidth, ecoWidth, crispWidth });
  await ctx.close();
} catch (error) {
  console.error('QUALITY TEST FAIL:', error);
  process.exitCode = 1;
} finally {
  await browser.close();
}

import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const base = process.env.GAME_URL || 'http://127.0.0.1:5173/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined),
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-first-run', '--disable-extensions']
});
const errors = [];
try {
  const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await desktopContext.newPage();
  page.on('pageerror', (error) => errors.push('Desktop: ' + error.message));
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('#playGame').click();
  await page.locator('#game canvas').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => Number.parseFloat(document.querySelector('#capacity')?.textContent ?? '0') > 0, null, { timeout: 15000, polling: 150 });
  assert.match(await page.locator('#capacity').innerText(), /\/ 18/);
  const cargo = parseFloat((await page.locator('#capacity').innerText()).split('/')[0]);
  assert(cargo > 0, 'At least one nearby scrap should be magnetically captured without waiting for tutorial screens');
  assert.equal(await page.locator('#surge').isEnabled(), true, 'Magnet Surge should start ready');
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  assert.match(await page.locator('#surge').innerText(), /SURGE [1-4]s/, 'Space must activate surge');
  assert.equal(await page.locator('#surge').isDisabled(), true, 'Surge must be unavailable while active');
  await page.keyboard.down('a');
  await page.waitForTimeout(1700);
  await page.keyboard.up('a');
  await page.waitForTimeout(400);
  const coins = Number((await page.locator('#coins').innerText()).replace(/,/g, ''));
  assert(coins > 0, 'Recycler must secure coins from the first collected scrap');
  assert.equal(await page.locator('#shopOverlay').isVisible(), false);
  await page.locator('#upgrades').click();
  assert.equal(await page.locator('#shopOverlay').isVisible(), true);
  assert.equal(await page.locator('#shopItems .shop-item').count(), 3);
  await page.locator('#closeShop').click();
  assert.equal(await page.locator('#shopOverlay').isVisible(), false);
  await page.locator('#pause').click();
  assert.equal(await page.locator('#pauseOverlay').isVisible(), true);
  await page.locator('#resume').click();
  await page.locator('#mute').click();
  assert.equal(await page.locator('#mute').getAttribute('aria-label'), 'Unmute game sounds');
  await page.screenshot({ path: path.join(root, 'qa-v03-desktop-automated.png') });
  await desktopContext.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', (error) => errors.push('Mobile: ' + error.message));
  await mobile.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await mobile.locator('#playGame').click();
  await mobile.locator('#game canvas').waitFor({ timeout: 15000 });
  await mobile.waitForTimeout(1300);
  for (const id of ['pause', 'mute', 'upgrades', 'joystick', 'beacon', 'surge']) {
    const box = await mobile.locator('#' + id).boundingBox();
    assert(box && box.width > 10 && box.height > 10, id + ' must exist and have positive size');
    assert(box.x >= -2 && box.x + box.width <= 392, id + ' must fit inside mobile viewport; got x=' + box.x + ', width=' + box.width);
  }
  const surgeBox = await mobile.locator('#surge').boundingBox();
  const joystickBox = await mobile.locator('#joystick').boundingBox();
  assert(surgeBox && joystickBox && surgeBox.x > joystickBox.x + joystickBox.width, 'Mobile Surge must not overlap joystick');
  const objectiveBox = await mobile.locator('#objective').boundingBox();
  assert(objectiveBox && surgeBox && objectiveBox.y + objectiveBox.height < surgeBox.y, 'Mobile objective must be above Magnet Surge button');
  assert(objectiveBox && joystickBox && objectiveBox.y + objectiveBox.height < joystickBox.y, 'Mobile objective must be above joystick');
  await mobile.locator('#surge').tap();
  await mobile.waitForTimeout(100);
  assert.match(await mobile.locator('#surge').innerText(), /SURGE [1-4]s/, 'Mobile button must activate surge');
  await mobile.screenshot({ path: path.join(root, 'qa-v03-mobile-automated.png') });
  await mobileContext.close();

  assert.deepEqual(errors, [], 'Uncaught browser errors are not allowed');
  console.log('PASS: Desktop gameplay, Magnet Surge activation and cooldown, recycler, coins, shop, pause/resume, mute.');
  console.log('PASS: Mobile 390x844 gameplay, Surge touch activation, no joystick overlap, primary controls in viewport.');
  console.log('Desktop first-deposit coins:', coins);
} catch (error) {
  console.error('E2E FAIL:', error);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
}

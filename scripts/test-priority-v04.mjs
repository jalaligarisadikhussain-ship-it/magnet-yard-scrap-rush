import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined),
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-first-run', '--disable-extensions']
});
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('#playGame').click();
  await page.waitForFunction(() => typeof window.__magnetYardQaWarp === 'function', null, { timeout: 15000 });
  await page.waitForFunction(() => parseFloat(document.querySelector('#capacity')?.textContent || '0') > 0, null, { timeout: 18000 });
  assert.equal(await page.locator('#rushPanel').isVisible(), false, 'Challenge must not interrupt onboarding');
  await page.evaluate(() => window.__magnetYardQaWarp(-15, 0));
  await page.waitForFunction(() => Number((document.querySelector('#coins')?.textContent || '0').replace(/,/g, '')) > 0, null, { timeout: 18000 });
  const firstCoins = Number((await page.locator('#coins').innerText()).replace(/,/g, ''));
  console.log('First bank successful:', firstCoins, 'coins');

  // Warp is only available in local DEV, and pickup/deposit remain real game simulation.
  await page.evaluate(() => window.__magnetYardQaWarp(-5.51, 2.66));
  await page.waitForFunction(() => !document.querySelector('#rushPanel')?.classList.contains('hidden'), null, { timeout: 18000 });
  assert.match(await page.locator('#rushTimer').innerText(), /s$/, 'Priority countdown should be visible');
  console.log('PASS: rare alloy triggers priority delivery after first bank');
  await page.screenshot({ path: 'qa-v04-priority-active.png' });

  await page.evaluate(() => window.__magnetYardQaWarp(-15, 0));
  await page.waitForFunction((min) => Number((document.querySelector('#coins')?.textContent || '0').replace(/,/g, '')) >= min + 70, firstCoins, { timeout: 18000 });
  const finalCoins = Number((await page.locator('#coins').innerText()).replace(/,/g, ''));
  assert.equal(await page.locator('#rushPanel').isVisible(), false, 'Priority UI closes after successful bank');
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  console.log('PASS: priority deposit credited 70 bonus coins, total:', finalCoins);
  await page.screenshot({ path: 'qa-v04-priority-bank.png' });
  await context.close();

  const mobileContext = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', (e) => errors.push(e.message));
  await mobile.goto('http://127.0.0.1:5173/', {waitUntil:'domcontentloaded',timeout:30000});
  await mobile.locator('#playGame').click();
  await mobile.waitForFunction(() => parseFloat(document.querySelector('#capacity')?.textContent || '0') > 0, null, {timeout:18000});
  await mobile.evaluate(() => window.__magnetYardQaWarp(-15,0));
  await mobile.waitForFunction(() => Number((document.querySelector('#coins')?.textContent || '0').replace(/,/g,''))>0,null,{timeout:18000});
  await mobile.evaluate(() => window.__magnetYardQaWarp(-5.51,2.66));
  await mobile.locator('#rushPanel').waitFor({state:'visible',timeout:18000});
  const rushBox = await mobile.locator('#rushPanel').boundingBox();
  const sideBox = await mobile.locator('.side').boundingBox();
  const joystickBox = await mobile.locator('#joystick').boundingBox();
  const surgeBox = await mobile.locator('#surge').boundingBox();
  assert(rushBox && sideBox && joystickBox && surgeBox, 'All mobile HUD elements must exist');
  assert(rushBox.x > sideBox.x + sideBox.width, 'Priority HUD must not overlap left-side mobile status');
  assert(rushBox.y + rushBox.height < surgeBox.y, 'Priority HUD must not overlap Surge button');
  assert(rushBox.y + rushBox.height < joystickBox.y, 'Priority HUD must not overlap joystick');
  await mobile.screenshot({path:'qa-v04-priority-mobile.png'});
  console.log('PASS: mobile priority challenge appears without overlapping controls');
  assert.deepEqual(errors,[], 'Desktop/mobile must have no uncaught browser errors');
  await mobileContext.close();
} catch (error) {
  console.error('PRIORITY E2E FAILED:', error);
  process.exitCode = 1;
} finally {
  await browser.close();
}

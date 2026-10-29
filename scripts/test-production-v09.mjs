import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({
  executablePath:process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined),
  headless:true,
  args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-first-run','--disable-extensions']
});
let failed=false;
try {
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  const page=await context.newPage();
  const errors=[];
  const assets=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{ if(r.url().includes('/assets/')) assets.push({status:r.status(),url:r.url()}); });
  const response=await page.goto('http://127.0.0.1:4175/',{waitUntil:'networkidle',timeout:30000});
  assert.equal(response?.status(),200);
  await page.locator('#introOverlay').waitFor({state:'visible',timeout:15000});
  assert.match(await page.locator('.brand').innerText(),/PROTOTYPE 0\.9/);
  assert.equal((await page.locator('#timer').innerText()).trim(),'90','Production timer must wait for Start');
  await page.locator('#playGame').click();
  assert.equal(await page.locator('#introOverlay').isVisible(),false,'Start must dismiss welcome');
  await page.locator('#game canvas').waitFor({timeout:15000});
  await page.waitForFunction(()=>Number.parseFloat(document.querySelector('#capacity')?.textContent||'0')>0,null,{timeout:30000});
  assert.equal(await page.locator('#cachePanel').isVisible(),false);
  assert(assets.length>=3,'Vite CSS and split JS chunks must load');
  assert(assets.every(r=>r.status===200),'Production assets must all return 200');
  assert.equal(await page.evaluate(()=>typeof window.__magnetYardQaSetElapsed),'undefined','Dev QA hooks must not ship');
  assert.deepEqual(errors,[],'No uncaught runtime errors');
  await page.screenshot({path:'qa-v08-production-desktop.png'});
  console.log('PASS: v0.9 production preview, Start, 3D scrap pickup, split assets and no browser errors.');
  console.log('Asset count:',assets.length);
  await context.close();
}catch(e){failed=true;console.error('PRODUCTION V08 QA FAILED:',e)}
finally {await browser.close();if(failed)process.exitCode=1}

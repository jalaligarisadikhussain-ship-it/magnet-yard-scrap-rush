import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const browser=await chromium.launch({
  executablePath:process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined),
  headless:true,
  args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-first-run','--disable-extensions']
});
let failed=false;
try {
  const errors=[];
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#playGame').tap();
  await page.waitForFunction(()=>typeof window.__magnetYardQaRenderStats === 'function',null,{timeout:10000});
  await page.waitForTimeout(500);
  const original=await page.evaluate(()=>window.__magnetYardQaRenderStats());
  assert(Number.isFinite(original.geometries)&&original.geometries>0,'Scene should upload actual geometry');
  assert(original.geometries<100,'Shared geometry should not allocate more than 100 unique GPU geometries');
  assert.equal(original.particleInstances,96,'Balanced mobile quality should use 96 particle instances');
  await page.locator('#pause').tap();
  await page.locator('#quality').selectOption('eco');
  await page.locator('#resume').tap();
  await page.waitForTimeout(500);
  const eco=await page.evaluate(()=>window.__magnetYardQaRenderStats());
  assert.equal(eco.particleInstances,48);
  assert.equal(eco.pixelRatio,1);
  await page.locator('#pause').tap();
  await page.locator('#quality').selectOption('crisp');
  await page.locator('#resume').tap();
  await page.waitForTimeout(500);
  const crisp=await page.evaluate(()=>window.__magnetYardQaRenderStats());
  assert.equal(crisp.particleInstances,144);
  assert(crisp.pixelRatio>eco.pixelRatio);
  assert(crisp.geometries<=original.geometries+2,'Changing quality should not create redundant geometries');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'qa-v09-mobile-optimized.png'});
  console.log('PASS: mobile GPU geometry reuse, Eco/Balanced/Crisp particle budgets, canvas scaling, no errors.');
  console.log('GPU STATS:',JSON.stringify({balanced:original,eco,crisp}));
  await context.close();
}catch(e){failed=true;console.error('PERFORMANCE QA FAILED:',e)}
finally{await browser.close();if(failed)process.exitCode=1}

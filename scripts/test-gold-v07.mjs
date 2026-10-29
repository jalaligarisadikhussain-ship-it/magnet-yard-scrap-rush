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
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#playGame').click();
  await page.waitForFunction(()=>typeof window.__magnetYardQaWarp==='function' && typeof window.__magnetYardQaSetElapsed==='function',null,{timeout:15000});
  await page.waitForFunction(()=>parseFloat(document.querySelector('#capacity')?.textContent||'0')>0,null,{timeout:18000});
  assert.equal(await page.locator('#cachePanel').isVisible(),false,'Event should not interrupt first seconds');
  await page.evaluate(()=>window.__magnetYardQaWarp(-15,0));
  await page.waitForFunction(()=>Number((document.querySelector('#coins')?.textContent||'0').replace(/,/g,''))>0,null,{timeout:12000});
  const firstBank=Number((await page.locator('#coins').innerText()).replace(/,/g,''));
  await page.evaluate(()=>window.__magnetYardQaSetElapsed(12.01));
  await page.locator('#cachePanel').waitFor({state:'visible',timeout:12000});
  assert.equal((await page.locator('#cacheState').innerText()).trim(),'DROP ACTIVE');
  console.log('PASS: first gold core drop begins after 12 seconds without blocking first deposit');

  await page.evaluate(()=>window.__magnetYardQaWarp(-4,-4));
  await page.waitForFunction(()=>document.querySelector('#cacheState')?.textContent==='CORE LOADED',null,{timeout:12000});
  console.log('PASS: gold core physically attracted and enters cargo');
  await page.screenshot({path:'qa-v07-gold-core-loaded.png'});
  await page.evaluate(()=>window.__magnetYardQaWarp(-15,0));
  await page.waitForFunction((minimum)=>Number((document.querySelector('#coins')?.textContent||'0').replace(/,/g,'')) >= minimum+60, firstBank,{timeout:18000});
  const afterGold=Number((await page.locator('#coins').innerText()).replace(/,/g,''));
  assert.equal(await page.locator('#cachePanel').isVisible(),false,'Banked core should hide the gold delivery marker');
  console.log('PASS: gold core banks 60+ coins and hides event UI; total:', afterGold);
  await page.evaluate(()=>window.__magnetYardQaSetElapsed(40.1));
  await page.locator('#cachePanel').waitFor({state:'visible',timeout:12000});
  console.log('PASS: separate second gold drop appears later in same shift');
  assert.deepEqual(errors,[],'No browser exceptions');
  await context.close();

  const mobileCtx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const mobile=await mobileCtx.newPage();
  mobile.on('pageerror',e=>errors.push(e.message));
  await mobile.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded',timeout:30000});
  await mobile.locator('#playGame').click();
  await mobile.waitForFunction(()=>typeof window.__magnetYardQaSetElapsed==='function',null,{timeout:15000});
  await mobile.evaluate(()=>window.__magnetYardQaSetElapsed(12.01));
  await mobile.locator('#cachePanel').waitFor({state:'visible',timeout:12000});
  const bounds=await Promise.all(['#cachePanel','.side','#surge','#joystick'].map(s=>mobile.locator(s).boundingBox()));
  const [cache,side,surge,joystick]=bounds;
  assert(cache&&side&&surge&&joystick,'All mobile UI elements present');
  assert(cache.x>side.x+side.width-2,'Gold UI cannot overlap left cargo/contract panel');
  assert(cache.y+cache.height<surge.y,'Gold UI cannot overlap Surge button');
  assert(cache.y+cache.height<joystick.y,'Gold UI cannot overlap touch joystick');
  await mobile.screenshot({path:'qa-v07-gold-drop-mobile.png'});
  assert.deepEqual(errors,[],'No browser exceptions on mobile');
  console.log('PASS: mobile gold drop screen 390x844 is visible without overlap');
  await mobileCtx.close();
} catch(e) {
  console.error('GOLD SALVAGE TEST FAILED:',e);failed=true;
} finally {
  await browser.close();
  if(failed)process.exitCode=1;
}

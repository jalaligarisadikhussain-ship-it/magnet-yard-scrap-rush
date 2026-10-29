import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({
  executablePath:process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined),
  headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-first-run','--disable-extensions']
});
let failed=false;
try{
  const desktop=await browser.newContext({viewport:{width:1280,height:720}});
  const page=await desktop.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
  await page.locator('#introOverlay').waitFor({state:'visible'});
  assert.match(await page.locator('#introTitle').innerText(),/MAGNET YARD/);
  const initial=await page.locator('#timer').innerText();
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#timer').innerText(),initial,'Timer must not run behind intro');
  assert.equal(await page.locator('#surge').isDisabled(),true);
  await page.screenshot({path:'qa-v08-start-desktop.png'});
  await page.locator('#playGame').click();
  assert.equal(await page.locator('#introOverlay').isVisible(),false);
  await page.evaluate(()=>window.__magnetYardQaSetTime(89.4)); await page.waitForFunction(()=>Number(document.querySelector('#timer').textContent)<90,null,{timeout:20000});
  await page.locator('#pause').click();
  const paused=await page.locator('#timer').innerText();
  await page.waitForTimeout(650);
  assert.equal(await page.locator('#timer').innerText(),paused,'Paused timer must stay fixed');
  await page.locator('#resume').click();
  assert.deepEqual(errors,[]);
  console.log('PASS: desktop welcome, paused intro, start action, pause/resume and no runtime errors');
  await desktop.close();

  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const mobile=await ctx.newPage();
  mobile.on('pageerror',e=>errors.push(e.message));
  await mobile.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
  await mobile.locator('#introOverlay').waitFor({state:'visible'});
  const btn=await mobile.locator('#playGame').boundingBox();
  assert(btn&&btn.x>=0&&btn.y>=0&&btn.x+btn.width<=392&&btn.y+btn.height<=844,'Start button in mobile viewport');
  await mobile.screenshot({path:'qa-v08-start-mobile.png'});
  await mobile.locator('#playGame').tap();
  await mobile.evaluate(()=>window.__magnetYardQaSetTime(89.4)); await mobile.waitForFunction(()=>Number(document.querySelector('#timer').textContent)<90,null,{timeout:20000});
  assert.equal(await mobile.locator('#introOverlay').isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: mobile 390x844 welcome screen, accessible start control and actual gameplay');
  await ctx.close();
}catch(e){failed=true;console.error('FAIL v0.8 Start tests:',e)}finally{await browser.close();if(failed)process.exitCode=1}

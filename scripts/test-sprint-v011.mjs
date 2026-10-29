import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({
  executablePath:process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined),
  headless:true,
  args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-first-run','--disable-extensions']
});
async function firstDeposit(finalSprint,mobile=false){
  const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}:{viewport:{width:1280,height:720}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#playGame').click();
  await page.waitForFunction(()=>typeof window.__magnetYardQaWarp==='function',null,{timeout:15000});
  if(finalSprint){
    await page.evaluate(()=>window.__magnetYardQaSetTime(19.5));
    await page.waitForFunction(()=>document.querySelector('#timer')?.parentElement?.classList.contains('sprint-active'),null,{timeout:12000});
    assert.match(await page.locator('#objectiveText').innerText(),/FINAL SPRINT/);
    if(mobile) await page.screenshot({path:'qa-v011-final-sprint-mobile.png'});
  } else {
    assert.equal(await page.locator('#timer').evaluate(x=>x.parentElement.classList.contains('sprint-active')),false);
  }
  await page.waitForFunction(()=>parseFloat(document.querySelector('#capacity')?.textContent||'0')>0,null,{timeout:20000});
  await page.evaluate(()=>window.__magnetYardQaWarp(-15,0));
  await page.waitForFunction(()=>Number((document.querySelector('#coins')?.textContent||'0').replace(/,/g,''))>0,null,{timeout:18000});
  const coins=Number((await page.locator('#coins').innerText()).replace(/,/g,''));
  assert.deepEqual(errors,[],'No browser runtime exceptions');
  await context.close();
  return coins;
}
let failed=false;
try {
  const base=await firstDeposit(false);
  const sprint=await firstDeposit(true);
  assert(sprint>=Math.round(base*1.25),'Final Sprint deposit should reward at least 25% extra');
  const mobile=await firstDeposit(true,true);
  assert(mobile>=Math.round(base*1.25),'Mobile Final Sprint bank reward should match desktop');
  console.log('PASS: Final Sprint activates only in last 20 seconds, highlights timer, 25% bank reward, desktop/mobile.');
  console.log('BASE_COINS='+base+' SPRINT_COINS='+sprint+' MOBILE_SPRINT_COINS='+mobile);
}catch(e){failed=true;console.error('FINAL SPRINT QA FAILED:',e)}
finally{await browser.close();if(failed)process.exitCode=1}

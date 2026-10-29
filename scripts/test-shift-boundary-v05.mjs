import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const browser=await chromium.launch({
  executablePath:process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined),
  headless:true,
  args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-first-run','--disable-extensions']
});
let hasError=false;
try{
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.evaluate(()=>document.getElementById('playGame')?.click());
  await page.waitForFunction(()=>typeof window.__magnetYardQaSetTime==='function',{},{timeout:15000});
  assert.equal(await page.locator('#endOverlay').isVisible(),false);
  await page.evaluate(()=>window.__magnetYardQaSetTime(0.06));
  await page.locator('#endOverlay').waitFor({state:'visible',timeout:15000});
  const firstRank=(await page.locator('#rank').innerText()).trim();
  assert.match(firstRank,/^(TRAINEE|BRONZE|SILVER|GOLD)$/);
  assert.equal((await page.locator('#shiftCount').innerText()).trim(),'1');
  await page.waitForTimeout(400);
  assert.equal((await page.locator('#shiftCount').innerText()).trim(),'1','Completion must be idempotent after extra frames');
  const firstSave=await page.evaluate(()=>JSON.parse(localStorage.getItem('magnet-yard-scrap-rush-save-v1')));
  assert.equal(firstSave.shifts,1);
  assert(Number.isFinite(firstSave.bestCoins));
  await page.screenshot({path:'qa-v05-shift-end.png'});
  console.log('PASS: end screen, rank, save, exactly one shift awarded');

  await page.locator('#playAgain').click();
  assert.equal(await page.locator('#endOverlay').isVisible(),false);
  assert(Number(await page.locator('#timer').innerText())>=89);
  await page.evaluate(()=>window.__magnetYardQaSetTime(0.06));
  await page.locator('#endOverlay').waitFor({state:'visible',timeout:15000});
  assert.equal((await page.locator('#shiftCount').innerText()).trim(),'2');
  await page.waitForTimeout(400);
  assert.equal((await page.locator('#shiftCount').innerText()).trim(),'2');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(()=>document.getElementById('playGame')?.click());
  await page.locator('#game canvas').waitFor({timeout:15000});
  const reloaded=await page.evaluate(()=>JSON.parse(localStorage.getItem('magnet-yard-scrap-rush-save-v1')));
  assert.equal(reloaded.shifts,2);
  assert.equal(await page.locator('#endOverlay').isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: restart, second completion, no double-count, saved shifts persist on reload');
  await context.close();
}catch(e){hasError=true;console.error('SHIFT-BOUNDARY TEST FAILED:',e)}
finally{await browser.close();if(hasError)process.exitCode=1;}

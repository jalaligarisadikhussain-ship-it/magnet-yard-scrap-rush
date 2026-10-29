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
  await context.addInitScript(() => {
    window.__sdkCalls=[];
    window.CrazyGames={SDK:{
      async init(){window.__sdkCalls.push('init')},
      game:{
        gameplayStart(){window.__sdkCalls.push('start')},
        gameplayStop(){window.__sdkCalls.push('stop')}
      }
    }};
  });
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>window.__sdkCalls.includes('init'),null,{timeout:12000});
  assert.equal((await page.evaluate(()=>window.__sdkCalls)).filter(x=>x==='start').length,0,'No gameplayStart before Start');
  await page.locator('#playGame').click();
  await page.waitForFunction(()=>window.__sdkCalls.includes('start'),null,{timeout:10000});
  await page.locator('#pause').click();
  await page.waitForFunction(()=>window.__sdkCalls.includes('stop'),null,{timeout:10000});
  await page.locator('#resume').click();
  await page.waitForFunction(()=>window.__sdkCalls.filter(x=>x==='start').length===2,null,{timeout:10000});
  await page.evaluate(()=>window.__magnetYardQaSetTime(0.06));
  await page.locator('#endOverlay').waitFor({state:'visible',timeout:15000});
  await page.waitForFunction(()=>window.__sdkCalls.filter(x=>x==='stop').length===2,null,{timeout:10000});
  const calls=await page.evaluate(()=>window.__sdkCalls);
  assert.deepEqual(calls,['init','start','stop','start','stop'],'SDK adapter should signal proper lifecycle');
  assert.deepEqual(errors,[],'No runtime errors from mock SDK');
  console.log('PASS: mock CrazyGames init/play/pause/resume/game-over lifecycle.',JSON.stringify(calls));
  await context.close();
}catch(e){failed=true;console.error('MOCK SDK QA FAILED:',e)}
finally {await browser.close();if(failed)process.exitCode=1}

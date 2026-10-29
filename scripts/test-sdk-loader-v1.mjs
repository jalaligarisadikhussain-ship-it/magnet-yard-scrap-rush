import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({
  executablePath:process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined),
  headless:true,
  args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-first-run','--disable-extensions']
});
let failed=false;
try {
  const ctx=await browser.newContext({viewport:{width:1280,height:720}});
  const page=await ctx.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  let sdkRequests=0;
  await page.route('https://sdk.crazygames.com/crazygames-sdk-v3.js', route=>{
    sdkRequests++;
    return route.fulfill({
      status:200,contentType:'application/javascript',
      body:"window.__cgOfflineLog=[];window.CrazyGames={SDK:{async init(){window.__cgOfflineLog.push('init')},game:{gameplayStart(){window.__cgOfflineLog.push('start')},gameplayStop(){window.__cgOfflineLog.push('stop')}}}};"
    });
  });
  await page.goto('http://127.0.0.1:5173/?cg-sdk-test=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__cgOfflineLog?.includes('init'),null,{timeout:15000});
  assert.equal(sdkRequests,1,'Offline test should inject exactly one SDK script');
  assert.equal(await page.locator('script[data-magnet-yard-sdk="v3"]').count(),1);
  assert.deepEqual(await page.evaluate(()=>window.__cgOfflineLog),['init']);
  await page.locator('#playGame').click();
  await page.waitForFunction(()=>window.__cgOfflineLog?.includes('start'),null,{timeout:10000});
  await page.locator('#pause').click();
  await page.waitForFunction(()=>window.__cgOfflineLog?.includes('stop'),null,{timeout:10000});
  await page.locator('#resume').click();
  await page.waitForFunction(()=>window.__cgOfflineLog?.filter(x=>x==='start').length===2,null,{timeout:10000});
  await page.evaluate(()=>window.__magnetYardQaSetTime(0.05));
  await page.locator('#endOverlay').waitFor({state:'visible',timeout:20000});
  await page.waitForFunction(()=>window.__cgOfflineLog?.filter(x=>x==='stop').length===2,null,{timeout:10000});
  assert.deepEqual(await page.evaluate(()=>window.__cgOfflineLog),['init','start','stop','start','stop']);
  assert.deepEqual(errors,[]);
  console.log('PASS: mocked SDK v3 script loaded once; init/start/pause/resume/end lifecycle');
  await ctx.close();

  const standalone=await browser.newContext({viewport:{width:960,height:600}});
  const local=await standalone.newPage();
  const localErrors=[];
  local.on('pageerror',e=>localErrors.push(e.message));
  await local.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
  assert.equal(await local.locator('script[data-magnet-yard-sdk="v3"]').count(),0,'Standalone must not request SDK');
  await local.locator('#playGame').click();
  await local.waitForFunction(()=>Number.parseFloat(document.querySelector('#capacity')?.textContent||'0')>0,null,{timeout:25000});
  assert.deepEqual(localErrors,[]);
  console.log('PASS: normal standalone page does not request CrazyGames SDK; gameplay works');
  await standalone.close();
} catch(e){failed=true;console.error('SDK LOADER QA FAILED:',e)}
finally{await browser.close();if(failed)process.exitCode=1}

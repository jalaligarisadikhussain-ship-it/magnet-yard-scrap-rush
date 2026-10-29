import { chromium } from 'playwright-core';
import { readFileSync, statSync } from 'node:fs';
import assert from 'node:assert/strict';

for (const spec of [{file:'cover.png',w:1600,h:900},{file:'icon.png',w:512,h:512}]) {
  const buffer=readFileSync('public/'+spec.file);
  assert.equal(buffer.subarray(1,4).toString(),'PNG');
  assert.equal(buffer.readUInt32BE(16),spec.w,'PNG has expected width');
  assert.equal(buffer.readUInt32BE(20),spec.h,'PNG has expected height');
  assert(statSync('public/'+spec.file).size>20000);
  console.log('PASS: '+spec.file+' dimensions and non-empty PNG data');
}

const browser=await chromium.launch({
  executablePath:process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined),
  headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-first-run','--disable-extensions']
});
let failed=false;
try {
  const ctx=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const page=await ctx.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded',timeout:30000});
  const onlineAssets=await page.evaluate(async()=>{
    const files=['cover.png','icon.png','icon.svg','privacy.html','credits.html','third-party-notices.txt','manifest.webmanifest'];
    return Promise.all(files.map(async f=>({file:f,status:(await fetch('./'+f)).status})));
  });
  assert(onlineAssets.every(f=>f.status===200),'Release files must be reachable from a static subdirectory');
  assert.equal(await page.locator('a[href="./privacy.html"]').count(),1);
  await page.locator('#playGame').tap({timeout:15000});
  await page.waitForFunction(()=>parseFloat(document.querySelector('#capacity')?.textContent||'0')>0,null,{timeout:25000});
  const hscroll=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
  assert.equal(hscroll,false,'Mobile landscape should not need horizontal page scrolling');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'qa-release-landscape-844x390.png'});
  console.log('PASS: landscape 844x390 Start/touch gameplay, no horizontal scroll, all legal/brand assets 200');
  await ctx.close();
}catch(e){failed=true;console.error('RELEASE ASSET QA FAILED:',e)}
finally{await browser.close();if(failed)process.exitCode=1}

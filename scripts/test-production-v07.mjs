import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined),headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-first-run','--disable-extensions']});
let failed=false;
try {
 const ctx=await browser.newContext({viewport:{width:1280,height:720}});
 const page=await ctx.newPage();
 const errs=[];
 page.on('pageerror',e=>errs.push(e.message));
 const resources=[];
 page.on('response',r=>{if(r.url().includes('/assets/'))resources.push({status:r.status(),url:r.url()})});
 const response=await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle',timeout:30000});
 assert.equal(response?.status(),200,'Production preview must serve HTTP 200');
 await page.locator('#game canvas').waitFor({timeout:15000});
 await page.waitForFunction(()=>parseFloat(document.querySelector('#capacity')?.textContent||'0')>0,null,{timeout:15000});
 assert.equal(await page.locator('#cachePanel').isVisible(),false,'No early distracting core banner');
 const html=await page.locator('.brand').innerText();
 assert.match(html,/PROTOTYPE 0\.7/);
 assert(resources.length>=3,'CSS, game script and split Three.js vendor must load');
 assert(resources.every(r=>r.status===200),'All generated assets must return 200');
 assert.equal(await page.evaluate(()=>typeof window.__magnetYardQaSetElapsed),'undefined','Testing-only controls must not ship in production');
 assert.deepEqual(errs,[],'No production runtime errors');
 await page.screenshot({path:'qa-v07-production-desktop.png'});
 console.log('PASS: v0.7 production build loads split assets, renders 3D, collects scrap; no QA hooks or runtime errors.');
 console.log('Asset count:',resources.length);
 await ctx.close();
} catch(e) {failed=true;console.error('PRODUCTION TEST FAILED:',e)}
finally {await browser.close();if(failed)process.exitCode=1}

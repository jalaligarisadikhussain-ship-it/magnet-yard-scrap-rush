import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-first-run','--disable-extensions']});
let error=false;
try {
 const context=await browser.newContext({viewport:{width:1280,height:720}});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install();
 await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded',timeout:30000});
 await page.locator('#game canvas').waitFor({timeout:15000});
 assert.equal(await page.locator('#endOverlay').isVisible(),false);
 await page.clock.runFor(5000);
 const t5=Number(await page.locator('#timer').innerText());
 console.log('Timer after 5 simulated seconds:',t5);
 assert(t5>=83&&t5<=87);
 await page.clock.runFor(87000);
 await page.locator('#endOverlay').waitFor({state:'visible',timeout:30000});
 assert.equal(await page.locator('#timer').innerText(),'0');
 const rank=(await page.locator('#rank').innerText()).trim();
 const count=(await page.locator('#shiftCount').innerText()).trim();
 assert.match(rank,/^(TRAINEE|BRONZE|SILVER|GOLD)$/);
 assert.equal(count,'1');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('magnet-yard-scrap-rush-save-v1')));
 assert.equal(saved.shifts,1);
 assert(Number.isFinite(saved.bestCoins));
 await page.screenshot({path:'qa-v05-end-90s.png'});
 console.log('PASS: 90-second simulated shift, rank, best, persisted shift count.',{rank,count,best:saved.bestCoins});
 await page.locator('#playAgain').click();
 assert.equal(await page.locator('#endOverlay').isVisible(),false);
 assert(Number(await page.locator('#timer').innerText())>=89);
 assert.deepEqual(errors,[]);
 console.log('PASS: Restart after complete shift.');
 await context.close();
}catch(e){console.error('FULL-SHIFT FAIL:',e);error=true}
finally{await browser.close();if(error)process.exitCode=1;}

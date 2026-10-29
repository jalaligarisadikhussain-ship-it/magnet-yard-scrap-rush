import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(import.meta.dirname,'..','dist');
const prefix='/nested/portal/game/';
const mimes={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    if(!pathname.startsWith(prefix)){res.writeHead(404);res.end('not found');return;}
    const rel=pathname.slice(prefix.length)||'index.html';
    const filename=path.resolve(root,rel);
    if(filename!==root&&!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const bytes=readFileSync(filename);
    res.writeHead(200,{'Content-Type':mimes[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(bytes);
  }catch{res.writeHead(404);res.end('not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const base='http://127.0.0.1:'+port+prefix+'index.html';
const browser=await chromium.launch({
  executablePath:process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined),
  headless:true,
  args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-first-run','--disable-extensions']
});
let failed=false;
try{
  const ctx=await browser.newContext({viewport:{width:1280,height:720}});
  const page=await ctx.newPage();
  const pageErrors=[]; const assets=[];
  page.on('pageerror',e=>pageErrors.push(e.message));
  page.on('response',r=>{
    if(r.url().includes(prefix+'assets/')) assets.push({code:r.status(),url:r.url()});
  });
  const response=await page.goto(base,{waitUntil:'networkidle',timeout:30000});
  assert.equal(response?.status(),200);
  assert.match(await page.locator('.brand').innerText(),/PROTOTYPE 0\.10/);
  assert.equal(await page.locator('#introOverlay').isVisible(),true);
  await page.locator('#playGame').click();
  await page.waitForFunction(()=>parseFloat(document.querySelector('#capacity')?.textContent||'0')>0,null,{timeout:30000});
  assert(assets.length>=3,'All three relative JS/CSS assets must load');
  assert(assets.every(x=>x.code===200),'No nested asset failures');
  assert.deepEqual(pageErrors,[]);
  assert.equal(await page.evaluate(()=>typeof window.__magnetYardQaWarp),'undefined','QA hook must be absent in production');
  await page.screenshot({path:'qa-v10-nested-desktop.png'});
  console.log('PASS: production ZIP nested URL, relative assets, Start, 3D magnetic pickup; assets=',assets.length);
  await ctx.close();

  const mobileCtx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const mobile=await mobileCtx.newPage();const errors=[];
  mobile.on('pageerror',e=>errors.push(e.message));
  await mobile.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
  await mobile.locator('#playGame').tap();
  await mobile.waitForFunction(()=>parseFloat(document.querySelector('#capacity')?.textContent||'0')>0,null,{timeout:30000});
  assert.deepEqual(errors,[]);
  await mobile.screenshot({path:'qa-v10-nested-mobile.png'});
  console.log('PASS: mobile nested-path ZIP loads and plays.');
  await mobileCtx.close();
}catch(e){failed=true;console.error('NESTED PREVIEW QA FAILED:',e)}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));if(failed)process.exitCode=1}

import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
process.env.PLAYWRIGHT_BROWSERS_PATH='D:/threejs-lab/tools/.browsers';
const {chromium}=createRequire(import.meta.url)('D:/threejs-lab/tools/node_modules/playwright');
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11','--disable-gpu-sandbox']});
const report={};
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5186/?dpr=1');await page.waitForFunction(()=>window.__game?.state.assetsReady);await page.waitForTimeout(1200);
 await page.locator('#enter').click();assert(await page.locator('body').evaluate(e=>e.classList.contains('exploring')));
 await page.locator('#pause').click();const before=await page.evaluate(()=>__game.state.distance);await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>__game.state.distance),before);
 await page.locator('#speed').click();assert.equal(await page.evaluate(()=>__game.state.speed),1.6);
 await page.locator('#cinema').click();assert(await page.locator('#restore').isVisible());await page.locator('#restore').click();
 const residentBefore=await page.evaluate(()=>__game.stats());
 const continuity=await page.evaluate(()=>{const g=__game;const length=g.stats().bayLength;g.state.distance=length-.001;g.gallery.update(g.state.distance);const a=new g.THREE.Matrix4();g.gallery.meshes[0].getMatrixAt(2,a);const zBefore=a.elements[14];g.state.distance=length+.001;g.gallery.update(g.state.distance);g.gallery.meshes[0].getMatrixAt(1,a);return{zBefore,zAfter:a.elements[14]};});assert(Math.abs(continuity.zAfter-continuity.zBefore-.002)<.00001);
 for(let i=0;i<25;i++){await page.evaluate(()=>__game.advance(400));await page.waitForTimeout(18);}
 await page.waitForTimeout(200);const residentAfter=await page.evaluate(()=>__game.stats());assert.equal(residentBefore.geometries,residentAfter.geometries);assert.equal(residentBefore.textures,residentAfter.textures);assert.equal(residentAfter.residentBays,11);assert.equal(new Set(residentAfter.slots).size,11);
 await page.screenshot({path:'D:/ProjectGames/galeria-legado/shot-10km.png'});
 report.streaming={before:residentBefore,after:residentAfter,continuity};report.controls='enter, pause, speed and interface restore passed';
 await page.goto('http://localhost:5186/?dpr=1&quality=low&webgl&clean');await page.waitForFunction(()=>window.__game?.state.assetsReady);await page.waitForTimeout(1000);report.webgl=await page.evaluate(()=>({backend:__game.engine.backend,...__game.stats()}));assert.equal(report.webgl.backend,'WebGL2');
 await page.screenshot({path:'D:/ProjectGames/galeria-legado/shot-webgl.png'});
 const phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});phone.on('pageerror',e=>errors.push(e.message));await phone.goto('http://localhost:5186/');await phone.waitForFunction(()=>window.__game?.state.assetsReady);await phone.locator('#enter').tap();await phone.locator('#pause').tap();assert(await phone.evaluate(()=>__game.state.paused));assert(await phone.evaluate(()=>document.documentElement.scrollWidth===innerWidth));report.mobile=await phone.evaluate(()=>({viewport:[innerWidth,innerHeight],...__game.stats()}));await phone.waitForTimeout(1200);await phone.screenshot({path:'D:/ProjectGames/galeria-legado/shot-mobile-final.png'});
 assert.deepEqual(errors,[]);report.errors=errors;report.passed=true;await fs.writeFile('D:/ProjectGames/galeria-legado/validation-night.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}



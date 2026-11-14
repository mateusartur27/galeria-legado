import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
process.env.PLAYWRIGHT_BROWSERS_PATH='D:/threejs-lab/tools/.browsers';
const {chromium}=createRequire(import.meta.url)('D:/threejs-lab/tools/node_modules/playwright');
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11','--disable-gpu-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{if(!localStorage.getItem('legado.lighting.zones.v2'))localStorage.setItem('legado.lighting.zones.v2',JSON.stringify({version:2,brightness:.9,lightHeight:4.4,roofBrightness:2.6}));});
 await page.goto('http://localhost:5186/?dpr=1');await page.waitForFunction(()=>window.__game?.state.assetsReady);
 assert.deepEqual(await page.evaluate(()=>({...__game.lightControls.settings})),{brightness:.9,lightHeight:4.4,roofBrightness:.7});
 const bulbBefore=await page.evaluate(()=>__game.gallery.materials.chandelier.color.toArray());
 await page.locator('#lighting-toggle').click();assert(await page.locator('#lighting-panel').isVisible());
 await page.locator('#lighting-brightness').fill('75');await page.locator('#lighting-brightness').dispatchEvent('input');
 await page.locator('#lighting-roof').fill('220');await page.locator('#lighting-roof').dispatchEvent('input');
 await page.locator('#lighting-height').fill('3.4');await page.locator('#lighting-height').dispatchEvent('input');
 await page.waitForFunction(()=>__game.scene.children.find(x=>x.isPointLight).position.y===3.4);
 const live=await page.evaluate(()=>({settings:{...__game.lightControls.settings},pointY:__game.scene.children.find(x=>x.isPointLight).position.y,hemi:__game.scene.children.find(x=>x.isHemisphereLight).intensity}));
 assert.deepEqual(await page.evaluate(()=>__game.gallery.materials.chandelier.color.toArray()),bulbBefore);assert.equal(live.settings.brightness,.75);assert.equal(live.settings.roofBrightness,2.2);assert.equal(live.settings.lightHeight,3.4);assert.equal(live.pointY,3.4);assert(Math.abs(live.hemi-.675)<1e-10);
 await page.locator('#lighting-save').click();assert.match(await page.locator('#lighting-status').textContent(),/Salvo!/);
 await page.reload();await page.waitForFunction(()=>window.__game?.state.assetsReady);assert.deepEqual(await page.evaluate(()=>({...__game.lightControls.settings})),{brightness:.75,lightHeight:3.4,roofBrightness:2.2});
 await page.locator('#lighting-toggle').click();assert.equal(await page.locator('#lighting-brightness').inputValue(),'75');assert.equal(await page.locator('#lighting-roof').inputValue(),'220');
 await page.locator('#lighting-reset').click();assert.deepEqual(await page.evaluate(()=>({...__game.lightControls.settings})),{brightness:1,lightHeight:5.35,roofBrightness:.7});await page.locator('#lighting-save').click();
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);assert(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));const box=await page.locator('#lighting-panel').boundingBox();assert(box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.y+box.height<=844);
 await page.screenshot({path:'D:/ProjectGames/galeria-legado/lighting-mobile.png'});
 await page.locator('#lighting-height').focus();await page.keyboard.press('Escape');assert(await page.locator('#lighting-panel').isHidden());
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,live,savedAcrossReload:true,mobilePanel:box,errors}));
}finally{await browser.close();}




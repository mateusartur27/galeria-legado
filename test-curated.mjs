import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
process.env.PLAYWRIGHT_BROWSERS_PATH='D:/threejs-lab/tools/.browsers';
const {chromium}=createRequire(import.meta.url)('D:/threejs-lab/tools/node_modules/playwright');
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11','--disable-gpu-sandbox']});
const report={};
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5186/?dpr=1');await page.waitForFunction(()=>window.__game?.state.assetsReady);await page.evaluate(()=>__game.pause());
 assert.equal(await page.evaluate(()=>__game.state.assetError),null);report.initial=await page.evaluate(()=>__game.stats());assert.equal(report.initial.curated.loaded.length,4);
 await page.locator('#look-back').click();await page.waitForTimeout(1800);const behind=await page.evaluate(()=>({target:__game.state.targetYaw,yaw:__game.state.yaw}));assert(Math.abs(behind.target-Math.PI)<1e-8);assert(Math.abs(behind.yaw-Math.PI)<.01);
 await page.screenshot({path:'D:/ProjectGames/galeria-legado/preview-behind.png'});
 // Real pointer drags must be able to exceed the old +/-0.85 radian limit.
 await page.mouse.move(900,380);await page.mouse.down();await page.mouse.move(250,380,{steps:15});await page.mouse.up();assert(await page.evaluate(()=>__game.state.targetYaw<Math.PI-1.5));
 const collisionCheck=()=>page.evaluate(()=>{
  const g=__game,{Box3,Matrix4}=g.THREE,issues=[];let decorations=0;
  for(const group of g.gallery.curated.groups){
   if(group.pendant)continue;
   for(let i=0;i<group.pieces[0].count;i++){
    const box=new Box3(),matrix=new Matrix4();for(const mesh of group.pieces){mesh.getMatrixAt(i,matrix);box.union(mesh.geometry.boundingBox.clone().applyMatrix4(matrix));}
    const x0=Math.min(Math.abs(box.min.x),Math.abs(box.max.x)),x1=Math.max(Math.abs(box.min.x),Math.abs(box.max.x));
    if(x0<2.32||x1>4.45)issues.push({id:group.id,x0,x1});decorations++;
   }
  }
  return{issues,decorations};
 });
 const plantClearance=()=>page.evaluate(()=>{
  const {Box3,Matrix4}=__game.THREE,issues=[];let count=0;
  for(const mesh of __game.gallery.hangingPlants.meshes)for(let i=0;i<mesh.count;i++){
   const matrix=new Matrix4();mesh.getMatrixAt(i,matrix);const box=mesh.geometry.boundingBox.clone().applyMatrix4(matrix);
   const edge=Math.max(Math.abs(box.min.x),Math.abs(box.max.x));
   if(edge>=4.067||box.min.y<4.05||box.max.y>6.98)issues.push({edge,y0:box.min.y,y1:box.max.y});count++;
  }
  return{issues,count};
 });
 report.plants=await plantClearance();assert.deepEqual(report.plants.issues,[]);assert(report.plants.count>82&&report.plants.count<=94);
 report.clearance=await collisionCheck();assert.deepEqual(report.clearance.issues,[]);assert.equal(report.clearance.decorations,38);
 for(let i=0;i<25;i++){await page.evaluate(()=>__game.advance(400));await page.waitForTimeout(20);}
 await page.waitForTimeout(200);report.after=await page.evaluate(()=>__game.stats());assert.equal(report.initial.geometries,report.after.geometries);assert.equal(report.initial.textures,report.after.textures);assert.equal(report.after.residentBays,19);assert.deepEqual((await plantClearance()).issues,[]);assert.deepEqual((await collisionCheck()).issues,[]);
 await page.goto('http://localhost:5186/?dpr=1&webgl&quality=low');await page.waitForFunction(()=>window.__game?.state.assetsReady);await page.waitForTimeout(800);assert.equal(await page.evaluate(()=>__game.engine.backend),'WebGL2');assert.equal(await page.evaluate(()=>__game.state.assetError),null);report.webgl='passed';
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);const button=await page.locator('#look-back').boundingBox();assert(button.x>=0&&button.x+button.width<=390);await page.locator('#look-back').click();await page.waitForTimeout(1400);await page.screenshot({path:'D:/ProjectGames/galeria-legado/curated-mobile.png'});report.mobile='passed';
 assert.deepEqual(errors,[]);report.errors=errors;report.passed=true;await fs.writeFile('D:/ProjectGames/galeria-legado/validation-curated.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}

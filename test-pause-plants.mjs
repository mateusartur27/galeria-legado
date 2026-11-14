import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
process.env.PLAYWRIGHT_BROWSERS_PATH='D:/threejs-lab/tools/.browsers';
const {chromium}=createRequire(import.meta.url)('D:/threejs-lab/tools/node_modules/playwright');
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11','--disable-gpu-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5186/?dpr=1');await page.waitForFunction(()=>window.__game?.state.assetsReady);
 await page.waitForFunction(()=>Math.abs(__game.camera.position.x+.3)>.012);
 const before=await page.evaluate(()=>{const before={position:__game.camera.position.toArray(),distance:__game.state.distance};document.getElementById('pause').click();return before;});
 await page.waitForTimeout(500);
 const paused=await page.evaluate(()=>({position:__game.camera.position.toArray(),distance:__game.state.distance}));assert.deepEqual(paused,before);
 const resumed=await page.evaluate(()=>{document.getElementById('pause').click();return __game.camera.position.toArray();});assert.deepEqual(resumed,before.position);
 await page.waitForFunction(d=>__game.state.distance>d,before.distance);await page.waitForTimeout(120);
 const after=await page.evaluate(()=>__game.camera.position.toArray());assert(Math.abs(after[0]-before.position[0])<.006);assert(Math.abs(after[1]-before.position[1])<.002);
 const foliage=await page.evaluate(()=>{
  const {Box3,Matrix4}=__game.THREE,mesh=__game.gallery.hangingPlants.meshes[0],issues=[];
  let maxDepth=0;
  for(let i=0;i<mesh.count;i++){
   const mat=new Matrix4();mesh.getMatrixAt(i,mat);const box=mesh.geometry.boundingBox.clone().applyMatrix4(mat),edge=Math.max(Math.abs(box.min.x),Math.abs(box.max.x));maxDepth=Math.max(maxDepth,edge);
   if(edge>=4.067||box.min.y<4.05||box.max.y>6.98)issues.push({i,edge,y:box.min.y});
  }
  return{instances:mesh.count,dimensions:__game.gallery.hangingPlants.dimensions,maxDepth,issues};
 });assert(foliage.dimensions.height>2);assert(foliage.instances>65);assert.deepEqual(foliage.issues,[]);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,before,paused,resumed,after,foliage,errors}));
}finally{await browser.close();}

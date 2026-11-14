import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
process.env.PLAYWRIGHT_BROWSERS_PATH='D:/threejs-lab/tools/.browsers';
const {chromium}=createRequire(import.meta.url)('D:/threejs-lab/tools/node_modules/playwright');
const browser=await chromium.launch({channel:'chromium',headless:true,args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11','--disable-gpu-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5186/?dpr=1&clean');await page.waitForFunction(()=>window.__game?.state.plantLoaded);await page.evaluate(()=>__game.pause());
 const check=()=>page.evaluate(()=>{
  const g=__game,{Box3,Matrix4}=g.THREE,issues=[];let checked=0;
  for(let i=0;i<g.gallery.count;i++)for(let j=0;j<4;j++){
   const bounds=new Box3(),matrix=new Matrix4();
   for(const mesh of g.gallery.props){mesh.geometry.computeBoundingBox();mesh.getMatrixAt(i*4+j,matrix);bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(matrix));}
   const front=j<2,side=j%2?1:-1,moduleZ=-(i-1)*12+g.state.distance%12-(side===1?6:0);
   const xFar=side>0?bounds.max.x:-bounds.min.x;
   const zFar=Math.max(Math.abs(bounds.min.z-moduleZ),Math.abs(bounds.max.z-moduleZ));
   if(xFar>(front?4.85:7.6)||zFar>(front?3.2:2.7))issues.push({i,j,xFar,zFar});checked++;
  }
  return{checked,issues,stats:g.stats(),roofWindows:g.scene.children.filter(m=>m.name==='gallery-sky').length};
 });
 const initial=await check();assert.deepEqual(initial.issues,[]);assert.equal(initial.roofWindows,0);
 await page.evaluate(()=>__game.advance(10000));await page.waitForTimeout(150);const distant=await check();assert.deepEqual(distant.issues,[]);assert.equal(initial.stats.geometries,distant.stats.geometries);assert.equal(initial.stats.textures,distant.stats.textures);assert.deepEqual(errors,[]);
 const report={passed:true,initial,distant,errors};await fs.writeFile('D:/ProjectGames/galeria-legado/validation-alternating.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}


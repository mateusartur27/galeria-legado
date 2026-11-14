import {chromium} from 'file:///D:/threejs-lab/tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const root='D:/ProjectGames/galeria-legado';
const browser=await chromium.launch({headless:true,executablePath:'D:/threejs-lab/tools/.browsers/chromium-1248/chrome-win64/chrome.exe',channel:'chromium',args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist','--enable-gpu','--use-angle=d3d11','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
try{
  await page.goto('http://localhost:5186/?rig&dpr=1');await page.waitForFunction(()=>window.__game?.rigEditor?.editing,null,{timeout:120000});
  await page.waitForTimeout(2000);
  // Save untouched user reference bytes, then restore after QA so tests never become the user's rig.
  const directory=root+'/asset-source/aleijadinho/rig-references';
  let previous=null;try{previous=await fs.readFile(directory+'/latest.json');}catch{}
  const oldFiles=await fs.readdir(directory).catch(()=>[]);
  try{
    console.log('Editor ready');
    const before=await page.evaluate(()=>{
      const e=__game.rigEditor,a=e.animation,mesh=a.skinned;mesh.updateWorldMatrix(true,false);mesh.skeleton.update();
      window.__rigVertexIndices=Array.from({length:60},(_,i)=>Math.floor(i*(mesh.geometry.attributes.position.count-1)/59));
      window.__rigVertices=__rigVertexIndices.map(i=>mesh.getVertexPosition(i,new __game.THREE.Vector3()).toArray());
      window.__rigOtherHeads=Object.fromEntries(e.snapshot().bones.map(b=>[b.name,b.modelHead]));
      return {point:e.snapshot().bones.find(b=>b.name==='LeftForeArm').modelHead,camera:__game.camera.position.toArray(),distance:__game.state.distance};
    });
    const dot=page.locator('[data-bone=LeftForeArm]'),box=await dot.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+27,box.y+box.height/2+32,{steps:8});await page.mouse.up();
    const after=await page.evaluate(()=>{
      const e=__game.rigEditor,a=e.animation,m=a.skinned;m.updateWorldMatrix(true,false);m.skeleton.update();
      let error=0;__rigVertexIndices.forEach((i,k)=>{error=Math.max(error,m.getVertexPosition(i,new __game.THREE.Vector3()).distanceTo(new __game.THREE.Vector3(...__rigVertices[k])));});
      const bones=e.snapshot().bones;
      return {point:bones.find(b=>b.name==='LeftForeArm').modelHead,error,others:Math.max(...bones.filter(b=>b.name!=='LeftForeArm').map(b=>new __game.THREE.Vector3(...b.modelHead).distanceTo(new __game.THREE.Vector3(...__rigOtherHeads[b.name])))),camera:__game.camera.position.toArray(),distance:__game.state.distance};
    });
    assert(Math.abs(after.point[0]-before.point[0])>.05);assert(Math.abs(after.point[1]-before.point[1])>.05);
    assert(after.error<1e-5,'Rig calibration must preserve rest mesh: '+after.error);assert(after.others<1e-6);assert.deepEqual(after.camera,before.camera);assert.equal(after.distance,before.distance);
    await page.click('[data-view=left]');await page.waitForTimeout(300);
    await page.selectOption('#rig-editor select','LeftForeArm');await page.waitForTimeout(100);
    const sidebox=await dot.boundingBox();await page.mouse.move(sidebox.x+sidebox.width/2,sidebox.y+sidebox.height/2);await page.mouse.down();await page.mouse.move(sidebox.x+sidebox.width/2+30,sidebox.y+sidebox.height/2,{steps:6});await page.mouse.up();
    const side=await page.evaluate(()=>__game.rigEditor.snapshot().bones.find(b=>b.name==='LeftForeArm').modelHead);assert(Math.abs(side[2]-after.point[2])>.05,'Side drag must change depth');
    console.log('Drag and rest mesh checks passed');
    await page.click('[data-save]');await page.waitForFunction(()=>document.querySelector('#rig-editor [data-status]').textContent.includes('Salvo no projeto'));
    const saved=JSON.parse(await fs.readFile(directory+'/latest.json','utf8'));assert.equal(saved.schema,'aleijadinho-rig/v1');assert.equal(saved.bones.length,22);
    assert.deepEqual(saved.bones.find(b=>b.name==='LeftForeArm').modelHead,side);
    await page.click('[data-preview]');const t=await page.evaluate(()=>__game.rigEditor.animation.time);await page.waitForTimeout(250);assert.notEqual(await page.evaluate(()=>__game.rigEditor.animation.time),t);
    await page.click('[data-preview]');await page.click('[data-reset-all]');await page.click('[data-view=front]');
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>__game.state.rigEditing),false);
    await page.click('#rig-toggle');assert.equal(await page.evaluate(()=>__game.state.rigEditing),true);
    console.log('Save, animation and close/reopen passed');
    // Mobile: reachable save controls in a scrollable panel.
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);
    const mobile=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,panel:document.querySelector('#rig-editor').getBoundingClientRect().toJSON()}));assert(!mobile.overflow);assert(mobile.panel.bottom<=844);
    await page.locator('[data-save]').scrollIntoViewIfNeeded();assert(await page.locator('[data-save]').isVisible());
    await page.screenshot({path:root+'/preview-rig-mobile.png'});
    await page.setViewportSize({width:1280,height:720});await page.waitForTimeout(300);await page.screenshot({path:root+'/preview-rig-tested.png'});
    console.log('Mobile and screenshots passed');
    await page.close();
    // A fresh browser context must read the saved project file without localStorage.
    const fresh=await browser.newContext({viewport:{width:1280,height:720}}),p=await fresh.newPage();
    p.on('pageerror',e=>console.log('FRESH ERROR',e.message));await p.goto('http://localhost:5186/?rig&dpr=1');await p.waitForFunction(()=>window.__game?.rigEditor?.editing,null,{timeout:120000});
    const restored=await p.evaluate(()=>__game.rigEditor.snapshot().bones.find(b=>b.name==='LeftForeArm').modelHead);
    for(let i=0;i<3;i++)assert(Math.abs(restored[i]-side[i])<1e-6);await fresh.close();
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,restMeshMaxError:after.error,otherJointsMaxError:after.others,dragged:{before:before.point,after:after.point,side},restoredFromProject:restored,mobile,errors},null,2));
  }finally{
    if(previous)await fs.writeFile(directory+'/latest.json',previous);else await fs.rm(directory+'/latest.json',{force:true});
    for(const name of await fs.readdir(directory))if(!oldFiles.includes(name)&&/^rig-.*\.json$/.test(name))await fs.rm(directory+'/'+name);
  }
}finally{await browser.close();}


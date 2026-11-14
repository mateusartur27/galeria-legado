import * as THREE from 'three/webgpu';
import { positionLocal, vec3, color, float, smoothstep, mx_noise_float } from 'three/tsl';

import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';



import { Engine } from '../core/Engine.js';
import { Pipeline } from '../render/Pipeline.js';
import { Gallery,createMaterials,PALETTE,BAY_LENGTH,galleryBrightness,galleryRoofBrightness,galleryLightHeight } from './Gallery.js';
import './style.css';
import { CuratedAssets } from './CuratedAssets.js';
import { CharacterSets, NICHE_X } from './CharacterSets.js';
import { windowView } from './PeriodRoom.js';
import { TimberRoof } from './TimberRoof.js';
import { HangingPlants } from './HangingPlants.js';
import './lighting-controls.css';
import { createLightingControls } from './LightingControls.js';

const params=new URLSearchParams(location.search);
const mobile=matchMedia('(pointer:coarse)').matches||innerWidth<700;
const low=mobile||params.get('quality')==='low';
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const $=id=>document.getElementById(id);
const progress=(value,label)=>{$('load-progress').style.width=`${value}%`;$('load-label').textContent=label;};
const state={distance:3,speed:1,paused:reduced,exploring:params.has('clean'),yaw:0,pitch:0,targetYaw:0,targetPitch:0,plantLoaded:false,assetsReady:false,assetError:null};
let noticeTimer;
function notice(text,ms=2200){$('notice').textContent=text;$('notice').classList.add('show');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').classList.remove('show'),ms);}

async function main(){
 progress(8,'Acendendo as luzes…');
 const style={toneMapping:'aces',exposure:1.1,shadows:{type:'pcf'},outline:{enabled:false},ao:null,bloom:low?null:{strength:.16,radius:.45,threshold:1.35},vignette:.3,grain:false,grade:{saturation:1.08,contrast:1.07,shadows:'#2a3358',highlights:'#fff0d6',split:.14}};
 const engine=await new Engine({style,quality:{maxDpr:low?1.25:1.6},fixedDpr:params.has('dpr')?Number(params.get('dpr')):null,forceWebGL:params.has('webgl')}).init();
 // Shader upload during loading must not be mistaken for steady-state GPU load.
 engine.adaptive=false;
 const renderer=engine.renderer;const scene=new THREE.Scene();scene.background=new THREE.Color(PALETTE.haze);scene.fog=new THREE.Fog('#0d1530',16,62);
 const camera=new THREE.PerspectiveCamera(innerWidth<700?67:58,innerWidth/innerHeight,.08,130);camera.position.set(-.3,2.15,0);
 engine.onResize((w,h)=>{camera.aspect=w/h;camera.fov=w<700?67:58;camera.updateProjectionMatrix();});
 const hemi=new THREE.HemisphereLight('#9aabd7','#59435c',.9);scene.add(hemi);
 const sun=new THREE.DirectionalLight('#8fa6f0',.85);sun.position.set(-12,18,-18);sun.target.position.set(3,0,-4);sun.castShadow=true;sun.shadow.mapSize.setScalar(low?1024:2048);Object.assign(sun.shadow.camera,{left:-17,right:17,top:22,bottom:-22,near:.5,far:70});sun.shadow.normalBias=.035;sun.shadow.bias=-.00015;sun.shadow.radius=3;scene.add(sun,sun.target);
 const fill=new THREE.DirectionalLight('#eab97d',.4);fill.position.set(4,3,2);scene.add(fill);
 const chandelierLights=[0,1].map(()=>{const light=new THREE.PointLight('#ffcc8a',68,19,2);scene.add(light);return light;});
 const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();const environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;scene.environmentIntensity=.33;room.dispose();pmrem.dispose();
 progress(26,'Preparando mármore, veludo e ouro…');
 const materials=await createMaterials();
 materials.lamp.color.multiplyScalar(2.6);
 // Painterly mottling + base grime on flat plaster/stone, in bay-local space (no crawling when bays recycle). Zero texture cost.
 for(const key of ['plaster','stone','clay','blue','dark']){
  const m=materials[key];if(!m)continue;
  const n1=mx_noise_float(positionLocal.mul(vec3(1.5,1.5,.5)));
  const shade=n1.mul(.1).add(1);
  const grime=smoothstep(1,0,positionLocal.y).mul(.14).add(smoothstep(4.5,7,positionLocal.y).mul(.1));
  m.colorNode=color(m.color).mul(shade).mul(float(1).sub(grime));
 }
 const lampBase=materials.lamp.color.clone(),pendantBase=materials.chandelier.color.clone();
 const lightControls=createLightingControls({
  onOpen:()=>{state.exploring=true;document.body.classList.add('exploring');},
  onChange:({brightness,lightHeight,roofBrightness})=>{
   galleryRoofBrightness.value=roofBrightness;
   galleryBrightness.value=brightness;galleryLightHeight.value=lightHeight;
   hemi.intensity=.9*brightness;sun.intensity=.85*brightness;fill.intensity=.4*brightness;scene.environmentIntensity=.33*brightness;
   materials.lamp.color.copy(lampBase);materials.chandelier.color.copy(pendantBase);materials.glow.opacity=.2*brightness;
  }
 });
 const gallery=new Gallery(scene,materials,{count:19});
 // Sets de personagens: ?people=N (quantas pessoas), ?side=left|right (lado da 1ª), ?set=machado (abre parado diante do set).
 const people=Math.max(1,Math.min(12,Number(params.get('people'))||1));
 const startSide=params.get('side')==='right'?1:-1;
 // Publicado (build de produção): abre direto no set do Machado de Assis. ?tour = galeria inteira; ?set=<id> = outro set; ?editar = painel de posições.
 const setParam=params.has('set')?params.get('set'):(import.meta.env.PROD&&!params.has('tour')?'machado':null);
 const sets=new CharacterSets(gallery,{people,side:startSide,first:1,renderer,focus:setParam});gallery.sets=sets;
 const setLights=[0,1].map(()=>{const l=new THREE.PointLight('#ffcf94',0,9,2);scene.add(l);return l;});
 const parkedId=setParam;
 const parked=parkedId?sets.entries.find(e=>e.character.id===parkedId)??sets.entries[0]:null;
 state.camX=-.3;state.eye=2.15;
 if(parked){state.eye=1.7;state.paused=true;state.exploring=true;state.distance=parked.logical*BAY_LENGTH+(parked.side===1?BAY_LENGTH/2:0);state.camX=parked.side*(Number(params.get('cx'))||1.5);state.yaw=state.targetYaw=-parked.side*Math.PI/2;state.pitch=state.targetPitch=-.04;}
 gallery.update(state.distance);
 const pipeline=new Pipeline(renderer,scene,camera,style,{aa:'fxaa',bloomMips:3});
 progress(62,'Preparando o percurso…');
 // Bounded dust field, deliberately sparse and only bright in the upper gallery.
 const dustGeometry=new THREE.BufferGeometry(),dust=new Float32Array(90*3);for(let i=0;i<90;i++){dust[i*3]=(Math.random()-.5)*9;dust[i*3+1]=.5+Math.random()*5.3;dust[i*3+2]=-Math.random()*65;}
 dustGeometry.setAttribute('position',new THREE.BufferAttribute(dust,3));
 const dustMaterial=new THREE.PointsNodeMaterial({color:'#ffe5b2',size:.025,sizeAttenuation:true,transparent:true,opacity:.35,depthWrite:false});
 const dustCloud=new THREE.Points(dustGeometry,dustMaterial);scene.add(dustCloud);
 camera.rotation.order='YXZ';camera.rotation.y=-.015;camera.rotation.x=.015;
 await renderer.compileAsync(scene,camera);
 progress(86,'Abrindo a galeria…');
 let lastUi=0,walkTime=0;const keys=new Set();
 // Colisão simples: nas alas só se entra pelos portais dos nichos que têm set; dentro do nicho, limite pela parede do fundo.
 const maxX=Math.max(6.3,...sets.entries.map(e=>e.character.maxX??6.3));const nicheOpen=(x,dist)=>{if(Math.abs(x)<4.2)return true;for(const e of sets.entries){if(Math.sign(x)!==e.side)continue;const z=dist-e.logical*BAY_LENGTH+(e.side===1?-BAY_LENGTH/2:0);if(Math.abs(z)<2.3&&Math.abs(x)<(e.room?.walkMaxX?e.room.walkMaxX():(e.character.maxX??6.3)))return true;}return false;};
 const moveBy=(dx,dz)=>{const nx=state.camX+dx,nd=Math.max(0,state.distance-dz);if(nicheOpen(nx,state.distance))state.camX=THREE.MathUtils.clamp(nx,-maxX,maxX);if(nicheOpen(state.camX,nd))state.distance=nd;};
 engine.setLoop((dt,t)=>{
  if(document.hidden)return;
  if(!state.paused)state.distance+=dt*(state.exploring ? .95 : .42)*state.speed;
  // Caminhada livre (W/S frente-trás, A/D laterais, Shift corre): usa a câmera dentro da galeria sem retomar o passeio automático.
  const walkDir=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),strafe=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
  if(walkDir||strafe){const v=(keys.has('ShiftLeft')?4:1.9)*dt,c=Math.cos(state.yaw),s=Math.sin(state.yaw);
   // yaw>0 olha para a esquerda (-x). Frente = (-sin, -cos) no plano x/z.
   const dx=(-s*walkDir+c*strafe)*v,dz=(-c*walkDir-s*strafe)*v;
   moveBy(dx,dz);}
  gallery.update(state.distance);
  sets.animate(dt);
  {const near=[...sets.entries].filter(e=>e.worldZ!==undefined).sort((a,b)=>Math.abs(a.worldZ)-Math.abs(b.worldZ));
   setLights.forEach((l,i)=>{const e=near[i];if(!e){l.intensity=0;return;}const d=Math.abs(e.worldZ);l.position.set(e.side*(NICHE_X-.5),3.4,e.worldZ+(i?.7:-.7));l.intensity=10*lightControls.settings.brightness*(1-THREE.MathUtils.smoothstep(d,14,30));});}
  const lampPhase=state.distance%BAY_LENGTH;
  chandelierLights.forEach((light,i)=>{const z=lampPhase-i*BAY_LENGTH;light.position.set(0,lightControls.settings.lightHeight,z);light.intensity=68*lightControls.settings.brightness*(1-THREE.MathUtils.smoothstep(Math.abs(z),8,12));});
  const blend=1-Math.exp(-dt*5);state.yaw+=(state.targetYaw-state.yaw)*blend;state.pitch+=(state.targetPitch-state.pitch)*blend;
  // Pause the sway clock itself, preserving position on both pause and resume.
  if(!state.paused&&!reduced)walkTime+=dt;
  camera.position.x=state.camX+(!reduced&&!parked?Math.sin(walkTime*.23)*.07:0);camera.position.y=state.eye+(!reduced?Math.sin(walkTime*.4)*.015:0);
  camera.rotation.set(.015+state.pitch,state.yaw-.015,0,'YXZ');
  if(window.__camOverride){const o=window.__camOverride;camera.position.set(...o.pos);camera.lookAt(...o.at);if(o.fov&&camera.fov!==o.fov){camera.fov=o.fov;camera.updateProjectionMatrix();}} // depuração: câmera livre
  dustCloud.position.z=(state.distance%BAY_LENGTH);if(!reduced)dustCloud.position.y=Math.sin(t*.12)*.06;
  pipeline.render();
  if(t-lastUi>.4){$('distance').textContent=`${Math.floor(state.distance).toString().padStart(3,'0')} m`;lastUi=t;}
 });
 const togglePause=()=>{state.paused=!state.paused;$('pause-icon').textContent=state.paused?'▷':'Ⅱ';$('pause').setAttribute('aria-label',state.paused?'Continuar percurso':'Pausar percurso');notice(state.paused?'Percurso pausado':'Seguindo em frente');};
 const enter=()=>{state.exploring=true;document.body.classList.add('exploring');};
 const cinema=()=>{enter();document.body.classList.toggle('cinema');};
 $('enter').onclick=enter;$('pause').onclick=togglePause;$('speed').onclick=()=>{state.speed=state.speed===1?1.6:state.speed===1.6?.6:1;$('speed').textContent=`${state.speed.toLocaleString('pt-BR')}×`;$('speed').setAttribute('aria-label',`Velocidade ${state.speed}`);};
 const backButton=document.createElement('button');backButton.id='look-back';backButton.textContent='↶';backButton.title='Olhar para trás (B)';backButton.setAttribute('aria-label','Olhar para trás');backButton.onclick=()=>{enter();state.targetYaw+=Math.PI;};document.getElementById('lighting-toggle').before(backButton);
 $('cinema').onclick=cinema;$('restore').onclick=cinema;
 $('fullscreen').onclick=async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch{notice('Use a opção de tela cheia do navegador');}};
 addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
 addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement)return;if(e.target instanceof HTMLButtonElement&&(e.code==='Space'||e.code==='Enter'))return;if(['KeyW','KeyA','KeyS','KeyD','ShiftLeft'].includes(e.code)){keys.add(e.code);if(e.code!=='ShiftLeft'){state.paused=true;$('pause-icon').textContent='▷';enter();}return;}if(e.code==='Space'){e.preventDefault();togglePause();}if(e.code==='KeyH')cinema();if(e.code==='KeyB')state.targetYaw+=Math.PI;if(e.code==='Escape'){document.body.classList.remove('cinema');state.targetYaw=0;state.targetPitch=0;}if(e.code==='ArrowLeft')state.targetYaw+=.12;if(e.code==='ArrowRight')state.targetYaw-=.12;if(e.code==='ArrowUp')state.targetPitch=Math.min(1.45,state.targetPitch+.08);if(e.code==='ArrowDown')state.targetPitch=Math.max(-1.45,state.targetPitch-.08);});
 renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();state.paused=true;$('pause-icon').textContent='▷';enter();const f=-e.deltaY*.0022;moveBy(-Math.sin(state.yaw)*f,-Math.cos(state.yaw)*f);},{passive:false});
 // Toque/mouse: 1 dedo arrasta para olhar; 2 dedos (pinça) avançam/recuam, como a roda do mouse.
 let dragging=false,px=0,py=0,pinch=0;const pts=new Map();const pinchDist=()=>{const [a,b]=[...pts.values()];return Math.hypot(a.x-b.x,a.y-b.y);};
 renderer.domElement.style.touchAction='none';
 renderer.domElement.addEventListener('pointerdown',e=>{pts.set(e.pointerId,{x:e.clientX,y:e.clientY});renderer.domElement.setPointerCapture(e.pointerId);enter();if(pts.size===2){dragging=false;pinch=pinchDist();}else{dragging=true;px=e.clientX;py=e.clientY;}});
 renderer.domElement.addEventListener('pointermove',e=>{const p=pts.get(e.pointerId);if(p){p.x=e.clientX;p.y=e.clientY;}if(pts.size===2){const d=pinchDist(),f=(d-pinch)*.006;pinch=d;state.paused=true;$('pause-icon').textContent='▷';moveBy(-Math.sin(state.yaw)*f,-Math.cos(state.yaw)*f);return;}if(!dragging)return;state.targetYaw+=(e.clientX-px)*.0025;state.targetPitch=THREE.MathUtils.clamp(state.targetPitch+(e.clientY-py)*.002,-1.45,1.45);px=e.clientX;py=e.clientY;});
 const endDrag=e=>{pts.delete(e.pointerId);dragging=false;if(pts.size===1){const [r]=[...pts.values()];px=r.x;py=r.y;dragging=true;}};renderer.domElement.addEventListener('pointerup',endDrag);renderer.domElement.addEventListener('pointercancel',endDrag);renderer.domElement.addEventListener('lostpointercapture',endDrag); if(state.exploring)enter();if(params.has('clean'))document.body.classList.add('cinema');if(state.paused)$('pause-icon').textContent='▷';
 window.__game={THREE,renderer,engine,scene,camera,gallery,state,pipeline,lightControls,stats:()=>({...gallery.getStats(),plantLoaded:state.plantLoaded,assetsReady:state.assetsReady,assetError:state.assetError,drawCalls:renderer.info.render.drawCalls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,dpr:renderer.getPixelRatio()}),advance:meters=>{state.distance+=meters;gallery.update(state.distance);},pause:()=>{state.paused=true;},look:(yaw,pitch=0)=>{state.targetYaw=yaw;state.targetPitch=pitch;}};
 progress(100,'Bem-vindo ao Legado'); // Painel "Mesa": escolher um objeto em cima da escrivaninha e posicioná-lo (X ao longo da mesa, Z em profundidade, giro). Salva no navegador.
 const buildDeskPanel=()=>{
  const desk=parked?.room?.desk;if(!desk)return;
  const panel=document.createElement('div');panel.id='desk-panel';
  panel.innerHTML='<style>#desk-panel{position:fixed;left:12px;bottom:12px;z-index:30;width:244px;padding:10px 12px;border-radius:12px;background:rgba(22,17,12,.86);color:#f2e6cf;font:12px/1.35 system-ui,sans-serif;backdrop-filter:blur(6px);box-shadow:0 6px 24px rgba(0,0,0,.35)}#desk-panel h4{margin:0 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;display:flex;justify-content:space-between}#desk-panel select{width:100%;margin:2px 0 4px;padding:5px;border-radius:7px;border:1px solid #5a4a36;background:#2c2218;color:#f2e6cf;font:12px system-ui}#desk-panel label{display:flex;justify-content:space-between;margin:7px 0 2px}#desk-panel input[type=range]{width:100%;accent-color:#d9b46c}#desk-panel .row{display:flex;gap:6px;margin-top:10px}#desk-panel button{flex:1;padding:6px 4px;border:0;border-radius:8px;background:#d9b46c;color:#241a0e;font:600 11px system-ui;cursor:pointer}#desk-panel button.alt{background:#3a2f22;color:#f2e6cf}#desk-panel.closed .body{display:none}</style><h4><span>Mesa · objetos</span><span class="chev">▾</span></h4><div class="body"><select></select></div>';
  const body=panel.querySelector('.body'),sel=body.querySelector('select');
  for(const k of desk.keys()){const o=document.createElement('option');o.value=k;o.textContent=desk.label(k);sel.appendChild(o);}
  const spec=desk.meta?.spec||[['x','Ao longo da mesa',-.65,.65,.005,'m'],['z','Frente ↔ fundo',.5,1.08,.005,'m'],['rot','Giro',-180,180,1,'°']];panel.querySelector('h4 span').textContent=desk.meta?.title||'Mesa · objetos';const inputs={};
  for(const [p,label,min,max,step,unit] of spec){const row=document.createElement('div');row.innerHTML=`<label><span>${label}</span><b></b></label><input type="range" min="${min}" max="${max}" step="${step}">`;const inp=row.querySelector('input'),out=row.querySelector('b');inp.oninput=()=>{desk.set(sel.value,p,inp.value);out.textContent=(+inp.value).toFixed(+inp.step>=1?0:3)+' '+inputs[p].unit;};inp.onchange=()=>inp.blur();inputs[p]={inp,out,unit,orig:{label,min,max,step,unit},row};body.appendChild(row);}
  const sync=()=>{const v=desk.get(sel.value),ov=desk.meta?.override?.(sel.value);for(const p in inputs){const r=inputs[p],o=ov?(ov[p]||null):r.orig;r.row.style.display=o?'':'none';if(!o)continue;r.row.querySelector('label span').textContent=o.label;r.inp.min=o.min;r.inp.max=o.max;r.inp.step=o.step;r.unit=o.unit;r.inp.value=v[p];r.out.textContent=(+v[p]).toFixed(+o.step>=1?0:3)+' '+o.unit;}};
  sel.onchange=()=>{desk.select(sel.value);sync();sel.blur();};
  const btns=document.createElement('div');btns.className='row';btns.innerHTML='<button data-a="save">Salvar</button><button data-a="reset" class="alt">Restaurar</button><button data-a="resetall" class="alt">Tudo</button><button data-a="copy" class="alt">Copiar</button>';body.appendChild(btns);
  btns.onclick=async e=>{const a=e.target.dataset?.a;if(!a)return;if(a==='save')notice(desk.save()?'Posições da mesa salvas neste navegador':'Não foi possível salvar aqui');if(a==='reset'){desk.reset(sel.value);sync();notice('Objeto restaurado (use Salvar para guardar)');}if(a==='resetall'&&confirm('Restaurar TODOS os objetos ao padrão e apagar o que você salvou?')){desk.reset();sync();notice('Tudo restaurado ao padrão');}if(a==='copy'){const txt=JSON.stringify(desk.all());try{await navigator.clipboard.writeText(txt);notice('Posições copiadas',4000);}catch{notice(txt,9000);}}e.target.blur();};
  const setOpen=open=>{panel.classList.toggle('closed',!open);panel.querySelector('.chev').textContent=open?'▾':'▸';desk.marker(open);};
  panel.querySelector('h4').onclick=()=>setOpen(panel.classList.contains('closed'));
  desk.select(sel.value);sync();setOpen(true);document.body.appendChild(panel);
 };if(parked)setTimeout(()=>notice(mobile?'Arraste para olhar · pinça com dois dedos para avançar':'W A S D andar · arraste para olhar · roda do mouse avança · Shift corre',7000),600);setTimeout(()=>$('loading').classList.add('done'),160);
 const curated=new CuratedAssets(gallery);gallery.curated=curated;
 const timber=new TimberRoof(gallery);gallery.timber=timber;
 const hangingPlants=new HangingPlants(gallery);gallery.hangingPlants=hangingPlants;
 try{await Promise.all([curated.load(),timber.load(),sets.load(),hangingPlants.load().then(()=>{state.plantLoaded=true;})]);}catch(error){state.assetError=error.message;console.error('Falha ao carregar decoração:',error);}finally{state.assetsReady=true;if(parked&&(!import.meta.env.PROD||params.has('editar')))buildDeskPanel();engine.frameTimes.length=0;engine.windowStart=performance.now();engine.adaptive=!params.has('dpr');}

}
main().catch(error=>{console.error(error);progress(100,'Não foi possível iniciar a galeria. Recarregue a página.');$('load-label').style.maxWidth='300px';$('load-label').style.textAlign='center';});















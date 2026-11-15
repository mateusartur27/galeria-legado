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
import { ktx2Loader } from './Ktx.js';
import { InstanceCuller } from './InstanceCulling.js';
import { TimberRoof } from './TimberRoof.js';
import { HangingPlants } from './HangingPlants.js';
import './lighting-controls.css';
import { createLightingControls } from './LightingControls.js';
import { RigStudio } from './RigStudio.js';

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
 const engine=await new Engine({style,antialias:params.has('fast'),quality:{maxDpr:low?2:1.6,minDpr:low?1.25:.75,levels:2},fixedDpr:params.has('dpr')?Number(params.get('dpr')):null,forceWebGL:params.has('webgl')}).init();
 // Shader upload during loading must not be mistaken for steady-state GPU load.
 engine.adaptive=false;
 const renderer=engine.renderer;ktx2Loader.detectSupport(renderer);const scene=new THREE.Scene();scene.background=new THREE.Color('#0d1530'); // = cor da névoa: a abertura do fim do corredor some na sombra em vez de ficar azul claro
 scene.fog=new THREE.Fog('#0d1530',low?8:14,low?24:38);
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
  onOpen:()=>{if(tourMode)return;state.exploring=true;document.body.classList.add('exploring');},
  onChange:({brightness,lightHeight,roofBrightness})=>{
   galleryRoofBrightness.value=roofBrightness;
   galleryBrightness.value=brightness;galleryLightHeight.value=lightHeight;
   hemi.intensity=.9*brightness;sun.intensity=.85*brightness;fill.intensity=.4*brightness;scene.environmentIntensity=.33*brightness;
   materials.lamp.color.copy(lampBase);materials.chandelier.color.copy(pendantBase);materials.glow.opacity=.2*brightness;
  }
 });
 // Corredor residente: só as baias que cabem na névoa (antes 19 = 228 m, ~1,3 M de triângulos desenhados sem ninguém ver).
 const culler=new InstanceCuller(); // só desenha as instâncias do corredor que a câmera vê
 const gallery=new Gallery(scene,materials,{count:low?7:9});
 // Sem sombras projetadas pelo corredor (manchas diagonais nas paredes/colunas); só a sala e o personagem projetam sombra.
 const stripShadows=()=>scene.children.forEach(o=>{if(/^(gallery|asset)-/.test(o.name))o.castShadow=false;});stripShadows();
 // Sets de personagens: ?people=N (quantas pessoas), ?side=left|right (lado da 1ª), ?set=machado (abre parado diante do set).
 // Passeio automático (padrão do site publicado, ou ?tour): a câmera anda sozinha, vira para cada nicho, para um instante e segue; as salas formam um anel que se repete.
 const tourMode=!params.has('set')&&!params.has('rig')&&(import.meta.env.PROD||params.has('tour'));
 if(tourMode){state.paused=false;state.exploring=false;document.body.classList.add('tour');const st=document.createElement('style');st.textContent='body.tour .controls,body.tour #enter,body.tour #lighting-toggle,body.tour #look-back,body.tour #rig-toggle,body.tour .hint{display:none!important}body.tour #intro{transition:opacity 1.6s;}body.tour.tour-clear #intro{opacity:0;pointer-events:none}';document.head.appendChild(st);setTimeout(()=>document.body.classList.add('tour-clear'),7000);}
 const people=Math.max(1,Math.min(12,Number(params.get('people'))||(tourMode?(low?6:8):1)));
 const startSide=params.get('side')==='right'?1:-1;
 // Publicado (build de produção): abre direto no set do Machado de Assis. ?tour = galeria inteira; ?set=<id> = outro set; ?editar = painel de posições.
 const setParam=params.has('rig')?(['machado','reboucas'].includes(params.get('rig'))?params.get('rig'):'aleijadinho'):params.has('set')?params.get('set'):null;
 const sets=new CharacterSets(gallery,{people,side:startSide,first:1,renderer,focus:setParam,only:tourMode&&!params.has('all')?['machado','aleijadinho']:null,pattern:tourMode&&!params.has('all')?(params.has('machado')?['machado']:['machado','aleijadinho']):null,loop:tourMode,maxRange:low?20:1e9,nearDist:low?12:18,lodDist:low?9:16});gallery.sets=sets;
 const setLights=[0,1].map(()=>{const l=new THREE.PointLight('#ffcf94',0,9,2);scene.add(l);return l;});
 const parkedId=setParam;let shadowZ=null;
 const parked=parkedId?sets.entries.find(e=>e.character.id===parkedId)??sets.entries[0]:null;
 state.camX=tourMode?0:-.3;state.eye=2.15;
 if(parked){Object.assign(sun.shadow.camera,{left:-10,right:10,top:10,bottom:-10});sun.shadow.camera.updateProjectionMatrix();}
 if(parked){state.eye=1.7;state.paused=true;state.exploring=true;state.distance=parked.logical*BAY_LENGTH+(parked.side===1?BAY_LENGTH/2:0);state.camX=parked.side*(Number(params.get('cx'))||2.8);state.yaw=state.targetYaw=-parked.side*Math.PI/2;state.pitch=state.targetPitch=-.04;}
 gallery.update(state.distance);
 const fast=params.has('fast'); // ?fast: sem pós-processamento (sem passes em tela cheia/HDR); MSAA direto no canvas
 const pipeline=fast?{render:()=>renderer.render(scene,camera),disableMsaa(){}}:new Pipeline(renderer,scene,camera,style,{aa:'fxaa',msaa:4,bloomMips:3}); // msaa 4×: bordas limpas nos personagens (o FXAA sozinho serrilhava e borrava)
 // Escada de qualidade: aparelho lento desliga efeitos ANTES de baixar a resolução (que é o que deixa pixelado). 1 = sem MSAA (FXAA); 2 = sem sombra do sol nem luzes extras do corredor.
 engine.settings.degrade=level=>{if(level>=1)pipeline.disableMsaa();if(level>=2){sun.castShadow=false;renderer.shadowMap.enabled=false;chandelierLights.forEach(l=>{l.visible=false;});setLights.forEach(l=>{l.visible=false;});}console.info('qualidade nível',level);};
 // Celular já abre no nível 2 (sem sombras, sem MSAA, sem luzes extras): medido num aparelho real, nível 0 = 20 fps e nível 2 = 56 fps.
 if(low){engine.level=2;engine.settings.degrade(2);}
 // ?stats: contador na tela (motor, fps, resolução, nível) para diagnosticar no celular.
 const PR=window.__prof={};let pa=0;
 if(params.has('stats')){const box=document.createElement('div');box.style.cssText='position:fixed;left:8px;top:8px;z-index:50;padding:6px 8px;border-radius:8px;background:#000a;color:#9f9;font:11px/1.35 monospace;white-space:pre;pointer-events:none';document.body.appendChild(box);setInterval(()=>{const i=renderer.info.render;box.textContent=`${engine.backend} · ${Math.round(engine.fps??0)} fps (${(engine.frameMs??0).toFixed(1)} ms)\n`+`resolução ${engine.dpr.toFixed(2)}x de ${devicePixelRatio}x · tela ${innerWidth}×${innerHeight}\n`+`animação ${(PR.animate??0).toFixed(1)} · cull ${(PR.cull??0).toFixed(1)} · desenho ${(PR.render??0).toFixed(1)} ms\n+pior quadro ${Math.round(engine.worstMs??0)} ms · CPU ${(engine.cpuAvg??0).toFixed(1)} (pior ${Math.round(engine.cpuWorst??0)}) ms\n`+`nível ${engine.level} · ${i.drawCalls} draws · ${(i.triangles/1000).toFixed(0)}k tris`;},600);}
 progress(62,'Preparando o percurso…');
 // (partículas de poeira removidas: custavam draw call/blend e não faziam falta)
 camera.rotation.order='YXZ';camera.rotation.y=-.015;camera.rotation.x=.015;
 await renderer.compileAsync(scene,camera);
 progress(86,'Abrindo a galeria…');
 let lastUi=0,walkTime=0;const keys=new Set();
 // Colisão simples: nas alas só se entra pelos portais dos nichos que têm set; dentro do nicho, limite pela parede do fundo.
 const maxX=Math.max(6.3,...sets.entries.map(e=>e.character.maxX??6.3));const nicheOpen=(x,dist)=>{if(Math.abs(x)<4.2)return true;for(const e of sets.entries){if(Math.sign(x)!==e.side)continue;const z=dist-e.logical*BAY_LENGTH+(e.side===1?-BAY_LENGTH/2:0);if(Math.abs(z)<2.3&&Math.abs(x)<(e.room?.walkMaxX?e.room.walkMaxX():(e.character.maxX??6.3)))return true;}return false;};
 const moveBy=(dx,dz)=>{const nx=state.camX+dx,nd=Math.max(0,state.distance-dz);if(nicheOpen(nx,state.distance))state.camX=THREE.MathUtils.clamp(nx,-maxX,maxX);if(nicheOpen(state.camX,nd))state.distance=nd;};
 // Roteiro do passeio: cruza o corredor; perto de um nicho desacelera, vira a cabeça para ele, se aproxima, fica ~4 s olhando e segue; o próximo nicho (do outro lado) repete.
 const tour={dwell:0,focus:0,aim:0,phase:0,done:new Set()};
 const tourStep=dt=>{
  // alvo = próximo personagem ainda não visitado, à frente (z do mundo negativo). Fase 0: para e olha a PAREDE antes do nicho; fase 1: vira para o personagem.
  let best=null,bz=1e9,tx=0,tz=0;
  for(const e of sets.entries){if(e.worldZ===undefined||!e.ready||tour.done.has(e.logical))continue;
   const st=e.character.stand,ax=e.side*NICHE_X+(e.side===-1?st.z:-st.z),az=e.worldZ+(e.side===-1?-st.x:st.x);
   if(az>1.5)continue;if(-az<bz){bz=-az;best=e;tx=ax;tz=az;}}
  if(best&&tour.cur!==best.logical){tour.cur=best.logical;tour.phase=0;tour.dwell=0;}
  const ss=THREE.MathUtils.smoothstep;let v=1.5,focus=0;
  if(best&&bz<12){const stop=tour.phase===0?3.4:.4,d=bz-stop;focus=1-ss(bz,4,12);v=1.5*(.25+.75*ss(d,.1,4));
   if(d<.25){tour.dwell+=dt;v=0;if(tour.phase===0&&tour.dwell>2.6){tour.phase=1;tour.dwell=0;}else if(tour.phase===1&&tour.dwell>4){tour.done.add(best.logical);tour.dwell=0;}}}
  state.distance+=dt*v*state.speed;
  const k=1-Math.exp(-dt*2.5);tour.focus+=(focus-tour.focus)*k;tour.aim+=(tour.phase-tour.aim)*(1-Math.exp(-dt*1.6));
  const side=best?best.side:0;
  state.camX+=(side*(1.1+1.7*tour.aim)*tour.focus-state.camX)*(1-Math.exp(-dt*2));
  state.eye+=((2.15-.45*tour.focus)-state.eye)*(1-Math.exp(-dt*2));
  // mira: parede ao lado do nicho (1,8 m de altura) → corpo do personagem; ambos centralizados na tela
  if(best){const wx=best.side*4.6,wz=tz+3.4,px=wx+(tx-wx)*tour.aim,pz=wz+(tz-wz)*tour.aim,py=1.8+(1.1-1.8)*tour.aim;
   const dx=px-state.camX,h=Math.hypot(dx,pz);state.targetYaw=Math.atan2(-dx,-pz)*tour.focus;state.targetPitch=Math.atan2(py-state.eye,h)*tour.focus;}else{state.targetYaw*=1-k;state.targetPitch*=1-k;}
 };
 engine.setLoop((dt,t)=>{
  if(document.hidden||state.warming)return;
  if(tourMode&&!state.exploring&&!state.paused)tourStep(dt);else if(!state.paused&&!state.rigEditing)state.distance+=dt*(state.exploring ? .95 : .42)*state.speed;
  // Caminhada livre (W/S frente-trás, A/D laterais, Shift corre): usa a câmera dentro da galeria sem retomar o passeio automático.
  const walkDir=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),strafe=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
  if(!state.rigEditing&&(walkDir||strafe)){const v=(keys.has('ShiftLeft')?4:1.9)*dt,c=Math.cos(state.yaw),s=Math.sin(state.yaw);
   // yaw>0 olha para a esquerda (-x). Frente = (-sin, -cos) no plano x/z.
   const dx=(-s*walkDir+c*strafe)*v,dz=(-c*walkDir-s*strafe)*v;
   moveBy(dx,dz);}
  {const upd=state.distance!==gallery.lastProgress||gallery.dirty||!culler.ready;if(upd)culler.restore();gallery.update(state.distance);if(upd){culler.register(scene);culler.capture();culler.ready=true;}}
  pa=performance.now();sets.animate(dt);PR.animate=(PR.animate??0)*.9+(performance.now()-pa)*.1;
  // Parado num set: a sombra do sol cobre só a sala (±10 m em vez de 34×44 m) → 4× mais nitidez com o mesmo mapa, e segue a sala se o visitante andar.
  if(parked&&parked.worldZ!==undefined){const tz=Math.round(parked.worldZ*2)/2;if(tz!==shadowZ){shadowZ=tz;const tx=parked.side*NICHE_X;sun.target.position.set(tx,1.2,tz);sun.position.set(tx-15,19.2,tz-14);}}
  {const near=[...sets.entries].filter(e=>e.worldZ!==undefined).sort((a,b)=>Math.abs(a.worldZ)-Math.abs(b.worldZ));
   setLights.forEach((l,i)=>{const e=near[i];if(!e){l.intensity=0;return;}const d=Math.abs(e.worldZ);l.position.set(e.side*(NICHE_X-.5),3.4,e.worldZ+(i?.7:-.7));l.intensity=10*lightControls.settings.brightness*(1-THREE.MathUtils.smoothstep(d,14,30));});}
  const lampPhase=state.distance%BAY_LENGTH;
  chandelierLights.forEach((light,i)=>{const z=lampPhase-i*BAY_LENGTH;light.position.set(0,lightControls.settings.lightHeight,z);light.intensity=68*lightControls.settings.brightness*(1-THREE.MathUtils.smoothstep(Math.abs(z),8,12));});
  const blend=1-Math.exp(-dt*5);state.yaw+=(state.targetYaw-state.yaw)*blend;state.pitch+=(state.targetPitch-state.pitch)*blend;
  // Pause the sway clock itself, preserving position on both pause and resume.
  if(!state.paused&&!reduced)walkTime+=dt;
  camera.position.x=state.camX+(!reduced&&!parked?Math.sin(walkTime*.23)*.07*(tourMode?0:1):0);camera.position.y=state.eye+(!reduced?Math.sin(walkTime*.4)*.015:0);
  camera.rotation.set((tourMode?0:.015)+state.pitch,state.yaw-(tourMode?0:.015),0,'YXZ');
  if(window.__camOverride){const o=window.__camOverride;camera.position.set(...o.pos);camera.lookAt(...o.at);if(o.fov&&camera.fov!==o.fov){camera.fov=o.fov;camera.updateProjectionMatrix();}} // depuração: câmera livre
  window.__game?.rigEditor?.updateOverlay();window.__game?.toolEditor?.update();
  pa=performance.now();sets.cull(camera);culler.apply(camera);const pb=performance.now();PR.cull=(PR.cull??0)*.9+(pb-pa)*.1;pipeline.render();PR.render=(PR.render??0)*.9+(performance.now()-pb)*.1;
  if(t-lastUi>.4){$('distance').textContent=`${Math.floor(state.distance).toString().padStart(3,'0')} m`;lastUi=t;}
 });
 const togglePause=()=>{state.paused=!state.paused;$('pause-icon').textContent=state.paused?'▷':'Ⅱ';$('pause').setAttribute('aria-label',state.paused?'Continuar percurso':'Pausar percurso');notice(state.paused?'Percurso pausado':'Seguindo em frente');};
 const enter=()=>{if(tourMode)return;state.exploring=true;document.body.classList.add('exploring');};
 const cinema=()=>{enter();document.body.classList.toggle('cinema');};
 $('enter').onclick=enter;$('pause').onclick=togglePause;$('speed').onclick=()=>{state.speed=state.speed===1?1.6:state.speed===1.6?.6:1;$('speed').textContent=`${state.speed.toLocaleString('pt-BR')}×`;$('speed').setAttribute('aria-label',`Velocidade ${state.speed}`);};
 const backButton=document.createElement('button');backButton.id='look-back';backButton.textContent='↶';backButton.title='Olhar para trás (B)';backButton.setAttribute('aria-label','Olhar para trás');backButton.onclick=()=>{if(tourMode)return;enter();state.targetYaw+=Math.PI;};document.getElementById('lighting-toggle').before(backButton);
 $('cinema').onclick=cinema;$('restore').onclick=cinema;
 $('fullscreen').onclick=async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch{notice('Use a opção de tela cheia do navegador');}};
 addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
 addEventListener('keydown',e=>{if(state.rigEditing||tourMode)return;if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement)return;if(e.target instanceof HTMLButtonElement&&(e.code==='Space'||e.code==='Enter'))return;if(['KeyW','KeyA','KeyS','KeyD','ShiftLeft'].includes(e.code)){keys.add(e.code);if(e.code!=='ShiftLeft'){state.paused=true;$('pause-icon').textContent='▷';enter();}return;}if(e.code==='Space'){e.preventDefault();togglePause();}if(e.code==='KeyH')cinema();if(e.code==='KeyB')state.targetYaw+=Math.PI;if(e.code==='Escape'){document.body.classList.remove('cinema');state.targetYaw=0;state.targetPitch=0;}if(e.code==='ArrowLeft')state.targetYaw+=.12;if(e.code==='ArrowRight')state.targetYaw-=.12;if(e.code==='ArrowUp')state.targetPitch=Math.min(1.45,state.targetPitch+.08);if(e.code==='ArrowDown')state.targetPitch=Math.max(-1.45,state.targetPitch-.08);});
 renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();if(state.rigEditing||tourMode)return;state.paused=true;$('pause-icon').textContent='▷';enter();const f=-e.deltaY*.0022;moveBy(-Math.sin(state.yaw)*f,-Math.cos(state.yaw)*f);},{passive:false});
 // Toque/mouse: 1 dedo arrasta para olhar; 2 dedos (pinça) avançam/recuam, como a roda do mouse.
 // Celular em pé: pede para virar na horizontal (a galeria é um panorama largo). Toque em "Tela cheia" tenta travar a orientação (Android); no iPhone só dá para girar o aparelho.
 {const rotate=$('rotate'),portrait=matchMedia('(orientation: portrait)'),touch=matchMedia('(pointer:coarse)').matches;let skipped=false;const upd=()=>{rotate.hidden=!(touch&&portrait.matches&&!skipped);};
  portrait.addEventListener('change',upd);upd();$('rotate-skip').onclick=()=>{skipped=true;upd();};
  $('rotate-go').onclick=async()=>{try{await document.documentElement.requestFullscreen({navigationUI:'hide'});}catch{}try{await screen.orientation.lock('landscape');}catch{notice('Gire o celular para a horizontal',3000);}upd();};}
 let dragging=false,px=0,py=0,pinch=0;const pts=new Map();const pinchDist=()=>{const [a,b]=[...pts.values()];return Math.hypot(a.x-b.x,a.y-b.y);};
 renderer.domElement.style.touchAction='none';
 renderer.domElement.addEventListener('pointerdown',e=>{if(state.rigEditing||tourMode)return;pts.set(e.pointerId,{x:e.clientX,y:e.clientY});renderer.domElement.setPointerCapture(e.pointerId);enter();if(pts.size===2){dragging=false;pinch=pinchDist();}else{dragging=true;px=e.clientX;py=e.clientY;}});
 renderer.domElement.addEventListener('pointermove',e=>{if(state.rigEditing||tourMode)return;const p=pts.get(e.pointerId);if(p){p.x=e.clientX;p.y=e.clientY;}if(pts.size===2){const d=pinchDist(),f=(d-pinch)*.006;pinch=d;state.paused=true;$('pause-icon').textContent='▷';moveBy(-Math.sin(state.yaw)*f,-Math.cos(state.yaw)*f);return;}if(!dragging)return;state.targetYaw+=(e.clientX-px)*.0025;state.targetPitch=THREE.MathUtils.clamp(state.targetPitch+(e.clientY-py)*.002,-1.45,1.45);px=e.clientX;py=e.clientY;});
 const endDrag=e=>{pts.delete(e.pointerId);dragging=false;if(pts.size===1){const [r]=[...pts.values()];px=r.x;py=r.y;dragging=true;}};renderer.domElement.addEventListener('pointerup',endDrag);renderer.domElement.addEventListener('pointercancel',endDrag);renderer.domElement.addEventListener('lostpointercapture',endDrag); if(state.exploring)enter();if(params.has('clean'))document.body.classList.add('cinema');if(state.paused)$('pause-icon').textContent='▷';
 window.__game={clearKeys:()=>keys.clear(),THREE,renderer,engine,scene,camera,gallery,state,pipeline,lightControls,stats:()=>({...gallery.getStats(),plantLoaded:state.plantLoaded,assetsReady:state.assetsReady,assetError:state.assetError,drawCalls:renderer.info.render.drawCalls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,dpr:renderer.getPixelRatio()}),advance:meters=>{state.distance+=meters;gallery.update(state.distance);},pause:()=>{state.paused=true;},look:(yaw,pitch=0)=>{state.targetYaw=yaw;state.targetPitch=pitch;}};
 progress(parked?72:100,parked?'Montando o escritório…':'Bem-vindo ao Legado'); // Painel "Mesa": escolher um objeto em cima da escrivaninha e posicioná-lo (X ao longo da mesa, Z em profundidade, giro). Salva no navegador.
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
 };if(parked)setTimeout(()=>notice(mobile?'Arraste para olhar · pinça com dois dedos para avançar':'W A S D andar · arraste para olhar · roda do mouse avança · Shift corre',7000),600);const hideLoading=()=>$('loading').classList.add('done');if(!parked&&!tourMode)setTimeout(hideLoading,160);
 // Pré-aquecimento (atrás da tela de carregamento): compila todos os shaders e desenha cada sala uma vez para enviar texturas/geometrias à GPU; assim o passeio não engasga ao revelar uma sala nova.
 const warmUp=async()=>{(window.__marks??=[]).push(['carregado',Math.round(performance.now())]);progress(90,'Preparando o passeio…');const nf=()=>new Promise(r=>requestAnimationFrame(r));state.warming=true;
  for(const e of sets.entries){e.group.visible=true;if(e.animation?.holder)e.animation.holder.visible=true;}
  await Promise.race([renderer.compileAsync(scene,camera),new Promise(r=>setTimeout(r,9000))]);
  (window.__marks??=[]).push(['shaders compilados',Math.round(performance.now())]);const rot=camera.rotation.clone(),pos=camera.position.clone();
  for(const e of sets.entries){camera.position.set(e.side*2.8,1.7,e.worldZ+(e.side===-1?-.5:.5));camera.rotation.set(0,-e.side*Math.PI/2,0,'YXZ');for(let i=0;i<2;i++){pipeline.render();await nf();}progress(90+Math.round(8*(sets.entries.indexOf(e)+1)/sets.entries.length),'Preparando o passeio…');}
  camera.position.copy(pos);camera.rotation.copy(rot);state.warming=false;(window.__marks??=[]).push(['pronto',Math.round(performance.now())]);progress(100,'Bem-vindo ao Legado');};
 const curated=new CuratedAssets(gallery);gallery.curated=curated;
 const timber=new TimberRoof(gallery);gallery.timber=timber;
 const hangingPlants=new HangingPlants(gallery);gallery.hangingPlants=hangingPlants;
 // Parado num set: a tela de carregamento só some quando a sala e o personagem estão prontos e com shaders compilados; a decoração do corredor (fora de vista) chega depois, sem travar. No celular as heras penduradas nem carregam (500 mil triângulos).
 // No celular parado num set, a decoração do corredor (lustres, vasos, estátuas, vigas: ~300 mil triângulos) nem é carregada.
 const decor=()=>Promise.all([curated.load(),timber.load(),low?Promise.resolve():hangingPlants.load().then(()=>{state.plantLoaded=true;})]).then(()=>{stripShadows();gallery.dirty=true;});
 try{if(parked){await sets.load();progress(94,'Acendendo as luzes…');await Promise.race([renderer.compileAsync(scene,camera),new Promise(r=>setTimeout(r,9000))]);progress(100,'Bem-vindo ao Legado');hideLoading();await decor();}else{await Promise.all([decor(),sets.load()]);if(tourMode)await warmUp();}}catch(error){state.assetError=error.message;console.error('Falha ao carregar decoração:',error);}finally{hideLoading();state.assetsReady=true;if(parked&&(!import.meta.env.PROD||params.has('editar')))buildDeskPanel();const aleijadinho=sets.entries.find(e=>e.character.id==='aleijadinho'&&e.animation);if(aleijadinho){const strike=aleijadinho.animation.strike;if(strike){await strike.load();strike.mount(window.__game);}aleijadinho.animation.toolEditor.mount(window.__game);}const studio=new RigStudio(window.__game);window.__game.rigEditor=studio;await studio.init();engine.frameTimes.length=0;engine.windowStart=performance.now();engine.adaptive=!params.has('dpr');}

}
main().catch(error=>{console.error(error);progress(100,'Não foi possível iniciar a galeria. Recarregue a página.');$('load-label').style.maxWidth='300px';$('load-label').style.textAlign='center';});















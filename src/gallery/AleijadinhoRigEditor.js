import * as THREE from 'three/webgpu';
import './rig-editor.css';

const KEY = 'legado.aleijadinho.rig.v1';
const ENDPOINT = '/__reference/aleijadinho-rig';
const POINTS = {
  Hips:'Bacia', Spine:'Cintura', Spine1:'Tronco', Spine2:'Peito', Neck:'Pescoço', Head:'Cabeça',
  LeftShoulder:'Clavícula E', LeftArm:'Ombro E', LeftForeArm:'Cotovelo E', LeftHand:'Punho E',
  RightShoulder:'Clavícula D', RightArm:'Ombro D', RightForeArm:'Cotovelo D', RightHand:'Punho D',
  LeftUpLeg:'Quadril E', LeftLeg:'Joelho E', LeftFoot:'Tornozelo E', LeftToeBase:'Pé E',
  RightUpLeg:'Quadril D', RightLeg:'Joelho D', RightFoot:'Tornozelo D', RightToeBase:'Pé D',
};
const valid = r => r?.schema === 'aleijadinho-rig/v1' && Array.isArray(r.bones) && r.bones.length === 22 &&
  new Set(r.bones.map(b=>b.name)).size===22 && r.bones.every(b=>POINTS[b.name] && Array.isArray(b.position) && b.position.length===3 && b.position.every(v=>Number.isFinite(v)&&Math.abs(v)<10));

// Calibração do esqueleto em repouso. Recalcular as inversas mantém a malha original
// intacta ao arrastar uma articulação; as ferramentas e a animação usam o rig ajustado.
export class AleijadinhoRigEditor {
  constructor(animation, game) {
    this.animation=animation; this.game=game; this.selected='Spine'; this.view='front'; this.zoom=1;
    this.bones=Object.values(animation.bones);
    const depth=b=>b.parent?.isBone?depth(b.parent)+1:0;
    this.bones.sort((a,b)=>depth(a)-depth(b));
    this.base=new Map(animation.restPose.map(([b,p,q,s])=>[b,{p:p.clone(),q:q.clone(),s:s.clone()}]));
    this.positions=new Map(this.bones.map(b=>[b,this.base.get(b).p.clone()]));
    const skeletons=new Set(); animation.root.traverse(n=>{if(n.isSkinnedMesh)skeletons.add(n.skeleton);});
    this.skeletons=[...skeletons].map(s=>({s,inv:s.boneInverses.map(m=>m.clone())}));
    this.restoreBase(); animation.holder.updateWorldMatrix(true,true);
    const inv=animation.holder.matrixWorld.clone().invert();
    this.originalMatrices=new Map(this.bones.map(b=>[b,inv.clone().multiply(b.matrixWorld)]));
    this.poseBackup=[]; animation.rigEditor=this; this.rebind(); animation.update(0);
    this.mount();
  }
  async load() {
    let local,project;
    try{local=JSON.parse(localStorage.getItem(KEY));}catch{}
    try{const r=await fetch(ENDPOINT);if(r.ok)project=await r.json();}catch{}
    const saved=[local,project].filter(valid).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
    if(saved){this.restorePoseOffsets();for(const b of this.bones)this.positions.get(b).fromArray(saved.bones.find(p=>p.name===b.name).position);this.rebind();this.animation.update(0);this.status.textContent='Último rig salvo carregado.';}
  }
  restoreBase() {for(const [b,v] of this.base){b.position.copy(v.p);b.quaternion.copy(v.q);b.scale.copy(v.s);}}
  restorePoseOffsets() {for(const [b,p] of this.poseBackup)b.position.copy(p);this.poseBackup.length=0;}
  applyCalibration() {
    for(const b of this.bones){this.poseBackup.push([b,b.position.clone()]);b.position.add(this.positions.get(b).clone().sub(this.base.get(b).p));}
    this.animation.root.updateMatrixWorld(true);
  }
  rest() {this.restorePoseOffsets();this.restoreBase();for(const b of this.bones)b.position.copy(this.positions.get(b));this.animation.holder.updateWorldMatrix(true,true);}
  rebind() {
    this.rest();const inv=this.animation.holder.matrixWorld.clone().invert();
    const adjusted=new Map(this.bones.map(b=>[b,inv.clone().multiply(b.matrixWorld)]));
    for(const {s,inv:original} of this.skeletons){
      s.boneInverses=s.bones.map((b,i)=>original[i].clone().multiply(this.originalMatrices.get(b)).multiply(adjusted.get(b).clone().invert()));s.update();
    }
  }
  setPoint(name, world) {
    if(!this.editing)return;
    if(this.preview)this.setPreview(false);
    this.rest();
    // Cabeças dos demais ossos permanecem no lugar: arrastar o cotovelo não leva o punho junto.
    const heads=new Map(this.bones.map(b=>[b,b.getWorldPosition(new THREE.Vector3())]));
    const b=this.animation.bones[name];if(!b)return;
    const limit=this.animation.holder.worldToLocal(world.clone()).clamp(new THREE.Vector3(-2.5,-1.7,-1.5),new THREE.Vector3(2.5,2.4,1.5));
    heads.set(b,this.animation.holder.localToWorld(limit));
    for(const bone of this.bones){bone.position.copy(bone.parent.worldToLocal(heads.get(bone).clone()));bone.updateMatrix();bone.updateWorldMatrix(false,false);this.positions.get(bone).copy(bone.position);}
    this.rebind();this.dirty=true;this.status.textContent='Ajustes ainda não salvos.';this.updateOverlay();
  }
  open() {
    if(this.editing)return;
    const {scene,state}=this.game,a=this.animation;
    this.wasPlaying=a.playing;this.wasPaused=state.paused;this.oldOverride=window.__camOverride;
    this.oldBackground=scene.background;this.oldFog=scene.fog;
    this.oldVisible=scene.children.map(n=>[n,n.visible]);for(const [n] of this.oldVisible)if(!n.isLight)n.visible=false;
    this.oldParent=a.holder.parent;this.oldTransform={p:a.holder.position.clone(),q:a.holder.quaternion.clone(),s:a.holder.scale.clone()};
    this.studio=new THREE.Group();scene.add(this.studio);this.studio.add(a.holder);a.holder.position.set(0,-(-.995)*a.scale,0);a.holder.quaternion.identity();
    this.tools=[a.mallet,a.chisel,...Object.values(a.bones).flatMap(b=>b.children.filter(c=>!c.isBone))];
    this.toolVisibility=new Map(this.tools.map(t=>[t,t.visible]));for(const t of this.tools)t.visible=false;
    this.fill=new THREE.HemisphereLight('#f1e7da','#8992a6',1.8);this.studio.add(this.fill);
    scene.background=new THREE.Color('#202932');scene.fog=null;
    this.editing=true;this.preview=false;a.playing=false;a.rest=false;state.rigEditing=true;state.paused=true;this.game.clearKeys?.();
    document.body.classList.add('rig-editing');this.panel.hidden=false;this.overlay.hidden=false;
    this.setPreview(false);this.focus();this.updateOverlay();
  }
  close() {
    if(!this.editing)return;
    this.endDrag();const a=this.animation,{scene,state}=this.game;
    this.restorePoseOffsets();this.oldParent.add(a.holder);a.holder.position.copy(this.oldTransform.p);a.holder.quaternion.copy(this.oldTransform.q);a.holder.scale.copy(this.oldTransform.s);
    this.studio.removeFromParent();for(const [t,v] of this.toolVisibility)t.visible=v;
    for(const [n,v] of this.oldVisible)n.visible=v;scene.background=this.oldBackground;scene.fog=this.oldFog;
    window.__camOverride=this.oldOverride;this.editing=false;this.preview=false;state.rigEditing=false;state.paused=this.wasPaused;
    a.playing=this.wasPlaying;a.rest=false;a.update(0);
    document.body.classList.remove('rig-editing');this.panel.hidden=true;this.overlay.hidden=true;
  }
  focus(view=this.view) {
    this.view=view;const mobile=innerWidth<700,at=new THREE.Vector3(0,mobile?.57:.77,0),d=(mobile?4.5:3.8)/this.zoom;
    const dir={front:[0,0,1],back:[0,0,-1],left:[1,0,0],right:[-1,0,0],three:[.75,.15,1]}[view];
    const pos=new THREE.Vector3(...dir).normalize().multiplyScalar(d).add(at);
    window.__camOverride={pos:pos.toArray(),at:at.toArray(),fov:36};
    for(const b of this.panel.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===view));
  }
  setPreview(on) {
    this.endDrag();this.preview=on;this.animation.playing=on;this.animation.rest=false;
    if(on)this.animation.update(0);else this.rest();
    this.panel.querySelector('[data-preview]').textContent=on?'Voltar ao rig parado':'Testar animação';
    this.overlay.classList.toggle('preview',on);
  }
  updateOverlay() {
    if(!this.editing)return;
    const {camera}=this.game;camera.updateMatrixWorld();this.animation.holder.updateWorldMatrix(true,true);
    const at=b=>{const p=b.getWorldPosition(new THREE.Vector3()).project(camera);return{x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2,z:p.z};};
    const positions=new Map(this.bones.map(b=>[b,at(b)]));
    for(const [b,el] of this.dots){const p=positions.get(b);el.style.transform=`translate(${p.x}px,${p.y}px)`;el.hidden=p.z<-1||p.z>1;el.style.zIndex=this.selected===b.name?'3':'1';el.setAttribute('aria-pressed',String(this.selected===b.name));}
    for(const [b,line] of this.lines){const p=positions.get(b),q=positions.get(b.parent);line.setAttribute('x1',p.x);line.setAttribute('y1',p.y);line.setAttribute('x2',q.x);line.setAttribute('y2',q.y);}
    const b=this.animation.bones[this.selected],p=this.animation.holder.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
    this.readout.textContent=`${POINTS[this.selected]} · X ${(p.x*this.animation.scale*100).toFixed(1)} / Y ${(p.y*this.animation.scale*100).toFixed(1)} / Z ${(p.z*this.animation.scale*100).toFixed(1)} cm`;
  }
  ray(e) {
    const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2),this.game.camera);return ray.ray;
  }
  startDrag(e,name) {
    if(this.preview)return;e.preventDefault();e.stopPropagation();this.selected=name;this.select.value=name;
    const b=this.animation.bones[name],head=b.getWorldPosition(new THREE.Vector3());
    const normal=this.game.camera.getWorldDirection(new THREE.Vector3());this.dragPlane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,head);
    const p=this.ray(e).intersectPlane(this.dragPlane,new THREE.Vector3());if(!p)return;
    this.drag={id:e.pointerId,el:e.currentTarget,offset:head.sub(p)};e.currentTarget.setPointerCapture(e.pointerId);this.updateOverlay();
  }
  moveDrag(e) {if(!this.drag||this.drag.id!==e.pointerId)return;e.preventDefault();const p=this.ray(e).intersectPlane(this.dragPlane,new THREE.Vector3());if(p)this.setPoint(this.selected,p.add(this.drag.offset));}
  endDrag() {if(this.drag){const {el,id}=this.drag;this.drag=null;if(el.hasPointerCapture(id))el.releasePointerCapture(id);}}
  reset(all=false) {
    this.setPreview(false);const b=this.animation.bones[this.selected];
    if(all){for(const bone of this.bones)this.positions.get(bone).copy(this.base.get(bone).p);this.rebind();}
    else {const original=new THREE.Vector3().setFromMatrixPosition(this.originalMatrices.get(b));this.setPoint(b.name,this.animation.holder.localToWorld(original));}
    this.dirty=true;this.status.textContent='Restaurado. Clique em Salvar para guardar.';
  }
  snapshot() {
    const wasPreview=this.preview;if(wasPreview)this.setPreview(false);this.rest();
    const inv=this.animation.holder.matrixWorld.clone().invert();
    return {schema:'aleijadinho-rig/v1',createdAt:new Date().toISOString(),character:'Aleijadinho',model:'/models/characters/aleijadinho-martelando.glb',
      mode:'rest-joint-calibration',units:'source-model-units',coordinateSpace:'holder-local +Y up +Z face',metersPerUnit:this.animation.scale,
      bones:this.bones.map(b=>({name:b.name,parent:b.parent.isBone?b.parent.name:null,position:this.positions.get(b).toArray(),quaternion:this.base.get(b).q.toArray(),scale:this.base.get(b).s.toArray(),
        originalPosition:this.base.get(b).p.toArray(),modelHead:new THREE.Vector3().setFromMatrixPosition(inv.clone().multiply(b.matrixWorld)).toArray()})),
      layout:this.animation.entry.room.desk?.all?.()??null};
  }
  async save() {
    const reference=this.snapshot();this.status.textContent='Salvando…';let browserSaved=false;
    try{localStorage.setItem(KEY,JSON.stringify(reference));browserSaved=true;}catch{}
    try{
      const response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(reference)});
      const result=await response.json();if(!response.ok||!result.saved)throw new Error(result.error||'Falha ao gravar');
      this.dirty=false;this.status.textContent='Salvo no projeto. Já posso ler o rig que você definiu.';return reference;
    }catch{
      const url=URL.createObjectURL(new Blob([JSON.stringify(reference,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download='aleijadinho-rig.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
      this.status.textContent=(browserSaved?'Salvo no navegador. ':'')+'Servidor de salvamento indisponível; uma cópia JSON foi baixada para compartilhar.';return reference;
    }
  }
  mount() {
    const button=document.createElement('button');button.id='rig-toggle';button.textContent='Rig';button.title='Ajustar rig do Aleijadinho';button.setAttribute('aria-label',button.title);button.onclick=()=>this.open();document.querySelector('.controls').append(button);
    const panel=document.createElement('section');panel.id='rig-editor';panel.hidden=true;panel.setAttribute('aria-label','Configurar rig do Aleijadinho');
    panel.innerHTML=`<header><span class="rig-eyebrow">ESTÚDIO · ALEIJADINHO</span><button data-close aria-label="Voltar à galeria">×</button></header><h2>Ajustar o rig</h2><p>Arraste os pontos até as articulações do corpo. A malha fica parada para você alinhar o esqueleto.</p><div class="rig-views"><button data-view="front">Frente</button><button data-view="left">Lado E</button><button data-view="right">Lado D</button><button data-view="back">Costas</button><button data-view="three">3/4</button></div><p class="rig-tip">Frente ajusta largura e altura.<br>Use as vistas laterais para a profundidade.</p><label>Articulação<select aria-label="Articulação"></select></label><output data-coordinates></output><label class="rig-zoom">Aproximação<input aria-label="Aproximação" type="range" min="0.75" max="1.65" value="1" step="0.05"></label><div class="rig-row"><button data-reset>Restaurar ponto</button><button data-reset-all>Restaurar tudo</button></div><button data-preview>Testar animação</button><button data-save class="rig-save">Salvar rig</button><p data-status role="status">Salvar grava um arquivo no projeto para eu consultar seus ajustes.</p>`;
    document.body.append(panel);this.panel=panel;this.status=panel.querySelector('[data-status]');this.readout=panel.querySelector('output');this.select=panel.querySelector('select');
    for(const [name,label] of Object.entries(POINTS)){const o=document.createElement('option');o.value=name;o.textContent=label;this.select.append(o);}this.select.value=this.selected;
    this.select.onchange=()=>{this.selected=this.select.value;this.updateOverlay();};
    panel.querySelector('[data-close]').onclick=()=>this.close();for(const b of panel.querySelectorAll('[data-view]'))b.onclick=()=>this.focus(b.dataset.view);
    panel.querySelector('input').oninput=e=>{this.zoom=+e.target.value;this.focus();};
    panel.querySelector('[data-reset]').onclick=()=>this.reset();panel.querySelector('[data-reset-all]').onclick=()=>this.reset(true);
    panel.querySelector('[data-preview]').onclick=()=>this.setPreview(!this.preview);
    panel.querySelector('[data-save]').onclick=()=>this.save().catch(e=>{this.status.textContent=e.message;});
    this.overlay=document.createElement('div');this.overlay.id='rig-points';this.overlay.hidden=true;document.body.append(this.overlay);
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');this.overlay.append(svg);this.lines=new Map();this.dots=new Map();
    for(const b of this.bones){
      if(b.parent.isBone){const line=document.createElementNS(ns,'line');svg.append(line);this.lines.set(b,line);}
      const dot=document.createElement('button');dot.className='rig-point';dot.dataset.bone=b.name;dot.title=POINTS[b.name];dot.setAttribute('aria-label',POINTS[b.name]);dot.innerHTML='<i></i><span>'+POINTS[b.name]+'</span>';
      dot.onpointerdown=e=>this.startDrag(e,b.name);dot.onpointermove=e=>this.moveDrag(e);dot.onpointerup=()=>this.endDrag();dot.onpointercancel=()=>this.endDrag();dot.onlostpointercapture=()=>this.endDrag();
      dot.onfocus=()=>{this.selected=b.name;this.select.value=b.name;};
      dot.onkeydown=e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();e.stopPropagation();const p=b.getWorldPosition(new THREE.Vector3()),q=this.game.camera.quaternion,step=e.shiftKey?.02:.005;
        const axis=new THREE.Vector3(e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0,e.key==='ArrowDown'?-1:e.key==='ArrowUp'?1:0,0).applyQuaternion(q);this.setPoint(b.name,p.addScaledVector(axis,step));};
      this.overlay.append(dot);this.dots.set(b,dot);
    }
    addEventListener('resize',()=>{if(this.editing)this.focus();});
    addEventListener('keydown',e=>{if(this.editing&&e.code==='Escape'){e.preventDefault();e.stopPropagation();this.close();}},true);
  }
}

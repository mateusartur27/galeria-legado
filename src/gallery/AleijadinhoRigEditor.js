import * as THREE from 'three/webgpu';
import './rig-editor.css';

const POINTS = {
  Hips:'Bacia', Spine:'Cintura', Spine1:'Tronco', Spine2:'Peito', Neck:'Pescoço', Head:'Cabeça',
  LeftShoulder:'Clavícula E', LeftArm:'Ombro E', LeftForeArm:'Cotovelo E', LeftHand:'Punho E',
  RightShoulder:'Clavícula D', RightArm:'Ombro D', RightForeArm:'Cotovelo D', RightHand:'Punho D',
  LeftUpLeg:'Quadril E', LeftLeg:'Joelho E', LeftFoot:'Tornozelo E', LeftToeBase:'Pé E',
  RightUpLeg:'Quadril D', RightLeg:'Joelho D', RightFoot:'Tornozelo D', RightToeBase:'Pé D',
};
const fingerSide = n => /(?:[._]?L(?:[._]?00[1-9])?$|^Left)/.test(n)?'left':/(?:[._]?R(?:[._]?00[1-9])?$|^Right)/.test(n)?'right':null;
const isFinger = n => /thumb|f_index|f_middle|f_ring|f_pinky|Hand(?:Index|Middle|Ring|Pinky)/i.test(n);
function boneLabel(n){
 if(POINTS[n])return POINTS[n];
 const side=fingerSide(n)==='left'?'E':'D';
 const finger=Object.entries({thumb:'Polegar',index:'Indicador',middle:'Médio',ring:'Anelar',pinky:'Mínimo'}).find(([k])=>n.toLowerCase().includes(k));
 if(finger)return finger[1]+' '+side+' · '+(n.match(/0?([123])(?:[._]?[LR])?$/)?.[1]??'base');
 const spine={'DEF-spine':'Bacia','DEF-spine.001':'Cintura','DEF-spine.002':'Tronco','DEF-spine.003':'Peito','DEF-spine.004':'Pescoço','DEF-spine.005':'Base da cabeça','DEF-spine.006':'Cabeça'};
 const spineKey=Object.keys(spine).find(k=>k.replaceAll('.','')===n.replaceAll('.',''));if(spineKey)return spine[spineKey];
 const body=Object.entries({shoulder:'Clavícula',upper_arm:'Ombro',forearm:'Cotovelo',hand:'Punho',thigh:'Quadril',shin:'Joelho',foot:'Tornozelo',toe:'Pé'}).find(([k])=>n.includes(k));
 return body?body[1]+' '+side+(/[LR][._]?001$/.test(n)?' · intermediário':''):n;
}
// Calibração do esqueleto em repouso. Recalcular as inversas mantém a malha original
// intacta ao arrastar uma articulação; as ferramentas e a animação usam o rig ajustado.
export class AleijadinhoRigEditor {
  constructor(animation, game, options={}) {
    this.options=options;this.id=options.id??animation.entry.character.id;this.characterName=options.name??animation.entry.character.name;this.key=`legado.${this.id}.rig.v1`;this.endpoint=`/__reference/${this.id}-rig`;
    this.animation=animation; this.game=game; this.selected='Spine'; this.view='front'; this.zoom=1;
    this.bones=Object.values(animation.bones);
    this.points=Object.fromEntries(this.bones.map(b=>[b.name,boneLabel(b.name)]));
    this.selected=animation.bones.Spine?'Spine':this.bones[0].name;this.groupFilter='body';this.frame='body';
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
    try{local=JSON.parse(localStorage.getItem(this.key));}catch{}
    try{const r=await fetch(this.endpoint);if(r.ok)project=await r.json();}catch{}
    const saved=[local,project].filter(r=>this.validReference(r)).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
    if(saved){this.applyReference(saved);this.status.textContent='Último rig salvo carregado.';}
  }
  validReference(r){return ['aleijadinho-rig/v1','character-rig/v2'].includes(r?.schema)&&(!r.characterId||r.characterId===this.id)&&Array.isArray(r.bones)&&r.bones.length===this.bones.length&&new Set(r.bones.map(b=>b.name)).size===this.bones.length&&r.bones.every(b=>this.points[b.name]&&Array.isArray(b.position)&&b.position.length===3&&b.position.every(v=>Number.isFinite(v)&&Math.abs(v)<100));}
  applyReference(r){if(!this.validReference(r))return;this.restorePoseOffsets();for(const b of this.bones)this.positions.get(b).fromArray(r.bones.find(p=>p.name===b.name).position);this.rebind();this.animation.update(0);}
  restoreBase() {for(const [b,v] of this.base){b.position.copy(v.p);b.quaternion.copy(v.q);b.scale.copy(v.s);}}
  restorePoseOffsets() {for(const [b,p] of this.poseBackup)b.position.copy(p);this.poseBackup.length=0;}
  applyCalibration() {
    for(const b of this.bones){this.poseBackup.push([b,b.position.clone()]);b.position.add(this.positions.get(b).clone().sub(this.base.get(b).p));}
    this.animation.root.updateMatrixWorld(true);
  }
  rest() {this.restorePoseOffsets();this.restoreBase();for(const b of this.bones)b.position.copy(this.positions.get(b));this.animation.holder.updateWorldMatrix(true,true);this.animation.root.updateMatrixWorld(true);}
  rebind() {
    this.rest();const inv=this.animation.holder.matrixWorld.clone().invert();
    const adjusted=new Map(this.bones.map(b=>[b,inv.clone().multiply(b.matrixWorld)]));
    for(const {s,inv:original} of this.skeletons){
      // B' · inverse' = B · inverse: preservar também correções de bind próprias de cada malha.
      s.boneInverses=s.bones.map((b,i)=>adjusted.get(b).clone().invert().multiply(this.originalMatrices.get(b)).multiply(original[i]));s.update();
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
    this.studio=new THREE.Group();scene.add(this.studio);this.studio.add(a.holder);a.holder.position.fromArray(a.editorPosition??[0,.995*a.scale,0]);a.holder.quaternion.identity();
    this.tools=[a.mallet,a.chisel,...Object.values(a.bones).flatMap(b=>b.children.filter(c=>!c.isBone))].filter(Boolean);
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
    this.view=view;const mobile=innerWidth<700,at=new THREE.Vector3(0,mobile?.25:.77,0),d=(mobile?6.2:3.8)/this.zoom;
    if(this.frame==='point'){const b=this.animation.bones[this.selected];this.rest();at.copy(b.getWorldPosition(new THREE.Vector3()));if(mobile)at.y-=.12;}
    const distance=this.frame==='point'?(mobile?1.2:.5)/this.zoom:d;
    const dir={front:[0,0,1],back:[0,0,-1],left:[1,0,0],right:[-1,0,0],three:[.75,.15,1]}[view];
    const pos=new THREE.Vector3(...dir).normalize().multiplyScalar(distance).add(at);
    window.__camOverride={pos:pos.toArray(),at:at.toArray(),fov:36};
    for(const b of this.panel.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===view));
  }
  setPreview(on) {
    if(on&&!this.animation.clip)return;this.endDrag();this.preview=on;this.animation.playing=on;this.animation.rest=false;
    if(on)this.animation.update(0);else this.rest();
    this.panel.querySelector('[data-preview]').textContent=this.animation.clip?(on?'Voltar ao rig parado':'Testar animação'):'Modelo em repouso';
    this.overlay.classList.toggle('preview',on);
  }
  updateOverlay() {
    if(!this.editing)return;
    // O reciclador da galeria reativa os sets a cada quadro; o estúdio os oculta novamente.
    for(const [n] of this.oldVisible)if(!n.isLight)n.visible=false;
    const {camera}=this.game;camera.updateMatrixWorld();this.animation.holder.updateWorldMatrix(true,true);
    const at=b=>{const p=b.getWorldPosition(new THREE.Vector3()).project(camera);return{x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2,z:p.z};};
    const positions=new Map(this.bones.map(b=>[b,at(b)]));
    for(const [b,el] of this.dots){const p=positions.get(b);el.style.transform=`translate(${p.x}px,${p.y}px)`;el.hidden=p.z<-1||p.z>1||!this.matchesGroup(b.name);el.style.zIndex=this.selected===b.name?'3':'1';el.setAttribute('aria-pressed',String(this.selected===b.name));}
    for(const [b,line] of this.lines){const p=positions.get(b),q=positions.get(b.parent);line.style.display=this.matchesGroup(b.name)?'':'none';line.setAttribute('x1',p.x);line.setAttribute('y1',p.y);line.setAttribute('x2',q.x);line.setAttribute('y2',q.y);}
    const b=this.animation.bones[this.selected],p=this.animation.holder.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
    this.readout.textContent=`${this.points[this.selected]} · X ${(p.x*this.animation.scale*100).toFixed(1)} / Y ${(p.y*this.animation.scale*100).toFixed(1)} / Z ${(p.z*this.animation.scale*100).toFixed(1)} cm`;
    this.syncCoordinates(p);
  }
  matchesGroup(name){return this.groupFilter==='all'||(this.groupFilter==='body'?!isFinger(name):isFinger(name)&&fingerSide(name)===this.groupFilter);}
  selectPoint(name){this.selected=name;this.select.value=name;this.updateOverlay();if(this.frame==='point')this.focus();}
  syncCoordinates(p){for(const [i,input] of this.coordinateInputs.entries())if(document.activeElement!==input)input.value=(p.getComponent(i)*this.animation.scale*100).toFixed(2);}
  fillPoints(){this.select.replaceChildren();for(const b of this.bones)if(this.matchesGroup(b.name)){const o=document.createElement('option');o.value=b.name;o.textContent=this.points[b.name];this.select.append(o);}if(!this.matchesGroup(this.selected))this.selected=this.select.options[0]?.value??this.selected;this.select.value=this.selected;this.updateOverlay();}
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
    return {schema:'character-rig/v2',createdAt:new Date().toISOString(),characterId:this.id,character:this.characterName,model:this.options.model??'/models/characters/aleijadinho-martelando.glb',source:this.options.source??null,normalization:this.animation.normalization??null,
      mode:this.animation.referenceOnly?'joint-layout':'rest-joint-calibration',units:'source-model-units',coordinateSpace:'holder-local +Y up +Z face',metersPerUnit:this.animation.scale,
      bones:this.bones.map(b=>({name:b.name,sourceName:(this.options.bones??[]).find(n=>n.replace(/[^a-z0-9]/gi,'')===b.name.replace(/[^a-z0-9]/gi,''))??b.name,parent:b.parent.isBone?b.parent.name:null,position:this.positions.get(b).toArray(),quaternion:this.base.get(b).q.toArray(),scale:this.base.get(b).s.toArray(),
        originalPosition:this.base.get(b).p.toArray(),modelHead:new THREE.Vector3().setFromMatrixPosition(inv.clone().multiply(b.matrixWorld)).toArray()})),
      layout:this.animation.entry.room.desk?.all?.()??null};
  }
  async save() {
    const reference=this.snapshot();this.status.textContent='Salvando…';let browserSaved=false;
    try{localStorage.setItem(this.key,JSON.stringify(reference));browserSaved=true;}catch{}
    try{
      const response=await fetch(this.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(reference)});
      const result=await response.json();if(!response.ok||!result.saved)throw new Error(result.error||'Falha ao gravar');
      this.dirty=false;try{const applied=this.options.onSaved?.(reference);this.status.textContent=applied?'Salvo e aplicado ao personagem do set.':'Salvo no projeto. Já posso ler o rig que você definiu.';}catch(error){this.status.textContent='Rig salvo. Não foi possível aplicar ao set: '+error.message;}return reference;
    }catch{
      const url=URL.createObjectURL(new Blob([JSON.stringify(reference,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download=this.id+'-rig.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
      this.status.textContent=(browserSaved?'Salvo no navegador. ':'')+'Servidor de salvamento indisponível; uma cópia JSON foi baixada para compartilhar.';return reference;
    }
  }
  dispose(){removeEventListener('resize',this.onResize);removeEventListener('keydown',this.onKeyDown,true);this.panel.remove();this.overlay.remove();}
  mount() {
    if(!this.options.catalog){const button=document.createElement('button');button.id='rig-toggle';button.textContent='Rig';button.title='Ajustar rig';button.setAttribute('aria-label',button.title);button.onclick=()=>this.open();document.querySelector('.controls').append(button);}
    const panel=document.createElement('section');panel.id='rig-editor';panel.hidden=true;panel.setAttribute('aria-label','Configurar rig de '+this.characterName);
    panel.innerHTML=`<header><span class="rig-eyebrow">ESTÚDIO · PERSONAGENS</span><button data-close aria-label="Voltar à galeria">×</button></header><h2>Ajustar o rig</h2><label>Personagem<select data-character aria-label="Personagem"></select></label><p data-rig-info></p><p>Arraste os pontos até as articulações do corpo. A malha fica parada para você alinhar o esqueleto.</p><div class="rig-views"><button data-view="front">Frente</button><button data-view="left">Lado E</button><button data-view="right">Lado D</button><button data-view="back">Costas</button><button data-view="three">3/4</button></div><p class="rig-tip">Frente ajusta largura e altura.<br>Use as vistas laterais para a profundidade.</p><label>Mostrar pontos<select data-group aria-label="Grupo de pontos"><option value="body">Corpo</option><option value="left">Dedos da mão esquerda</option><option value="right">Dedos da mão direita</option><option value="all">Todos os ossos</option></select></label><label>Articulação<select data-point aria-label="Articulação"></select></label><output data-coordinates></output><div class="rig-coordinates"><label>X · cm<input type="number" step="0.01" data-axis="0" aria-label="X do ponto em centímetros"></label><label>Y · cm<input type="number" step="0.01" data-axis="1" aria-label="Y do ponto em centímetros"></label><label>Z · cm<input type="number" step="0.01" data-axis="2" aria-label="Z do ponto em centímetros"></label></div><div class="rig-row"><button data-frame="body">Ver corpo</button><button data-frame="point">Aproximar ponto</button></div><label class="rig-zoom">Aproximação<input aria-label="Aproximação" type="range" min="0.75" max="1.65" value="1" step="0.05"></label><div class="rig-row"><button data-reset>Restaurar ponto</button><button data-reset-all>Restaurar tudo</button></div><button data-preview>Testar animação</button><button data-save class="rig-save">Salvar rig</button><p data-status role="status">Salvar grava um arquivo no projeto para eu consultar seus ajustes.</p>`;
    document.body.append(panel);this.panel=panel;this.status=panel.querySelector('[data-status]');this.readout=panel.querySelector('output');this.select=panel.querySelector('[data-point]');
    this.coordinateInputs=[...panel.querySelectorAll('[data-axis]')];
    for(const [i,input] of this.coordinateInputs.entries())input.oninput=()=>{const v=input.valueAsNumber;if(!Number.isFinite(v))return;if(this.preview)this.setPreview(false);this.rest();const p=this.animation.holder.worldToLocal(this.animation.bones[this.selected].getWorldPosition(new THREE.Vector3()));p.setComponent(i,v/(this.animation.scale*100));this.setPoint(this.selected,this.animation.holder.localToWorld(p));};
    const chooser=panel.querySelector('[data-character]');for(const c of this.options.catalog??[{id:this.id,name:this.characterName}]){const o=document.createElement('option');o.value=c.id;o.textContent=c.name;chooser.append(o);}chooser.value=this.id;chooser.onchange=()=>this.options.onCharacterChange?.(chooser.value);
    const fingers=this.bones.filter(b=>isFinger(b.name));panel.querySelector('[data-rig-info]').textContent=this.animation.referenceOnly?'Sem esqueleto neste arquivo: marque as articulações para montarmos o rig.':`${this.bones.length} ossos · ${fingers.length?fingers.length+' articulações de dedos':'sem ossos individuais nos dedos'}`;
    for(const option of panel.querySelector('[data-group]').options)if(['left','right'].includes(option.value)&&!fingers.some(b=>fingerSide(b.name)===option.value))option.disabled=true;
    panel.querySelector('[data-group]').onchange=e=>{this.groupFilter=e.target.value;this.fillPoints();};
    for(const b of panel.querySelectorAll('[data-frame]'))b.onclick=()=>{this.frame=b.dataset.frame;this.zoom=1;panel.querySelector('.rig-zoom input').value=1;this.focus();};
    if(!this.animation.clip){panel.querySelector('[data-preview]').disabled=true;panel.querySelector('[data-preview]').textContent='Modelo em repouso';}
    for(const [name,label] of Object.entries(this.points)){const o=document.createElement('option');o.value=name;o.textContent=label;this.select.append(o);}this.select.value=this.selected;
    this.select.onchange=()=>this.selectPoint(this.select.value);
    panel.querySelector('[data-close]').onclick=()=>this.close();for(const b of panel.querySelectorAll('[data-view]'))b.onclick=()=>this.focus(b.dataset.view);
    panel.querySelector('.rig-zoom input').oninput=e=>{this.zoom=+e.target.value;this.focus();};
    panel.querySelector('[data-reset]').onclick=()=>this.reset();panel.querySelector('[data-reset-all]').onclick=()=>this.reset(true);
    panel.querySelector('[data-preview]').onclick=()=>this.setPreview(!this.preview);
    panel.querySelector('[data-save]').onclick=()=>this.save().catch(e=>{this.status.textContent=e.message;});
    this.overlay=document.createElement('div');this.overlay.id='rig-points';this.overlay.hidden=true;document.body.append(this.overlay);
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');this.overlay.append(svg);this.lines=new Map();this.dots=new Map();
    for(const b of this.bones){
      if(b.parent.isBone){const line=document.createElementNS(ns,'line');svg.append(line);this.lines.set(b,line);}
      const dot=document.createElement('button');dot.className='rig-point';dot.dataset.bone=b.name;dot.title=this.points[b.name];dot.setAttribute('aria-label',this.points[b.name]);dot.innerHTML='<i></i><span>'+this.points[b.name]+'</span>';
      dot.onpointerdown=e=>this.startDrag(e,b.name);dot.onpointermove=e=>this.moveDrag(e);dot.onpointerup=()=>this.endDrag();dot.onpointercancel=()=>this.endDrag();dot.onlostpointercapture=()=>this.endDrag();
      dot.onfocus=()=>this.selectPoint(b.name);
      dot.onkeydown=e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();e.stopPropagation();const p=b.getWorldPosition(new THREE.Vector3()),q=this.game.camera.quaternion,step=e.shiftKey?.02:.005;
        const axis=new THREE.Vector3(e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0,e.key==='ArrowDown'?-1:e.key==='ArrowUp'?1:0,0).applyQuaternion(q);this.setPoint(b.name,p.addScaledVector(axis,step));};
      this.overlay.append(dot);this.dots.set(b,dot);
    }
    this.onResize=()=>{if(this.editing)this.focus();};addEventListener('resize',this.onResize);
    this.onKeyDown=e=>{if(this.editing&&e.code==='Escape'){e.preventDefault();e.stopPropagation();this.close();}};addEventListener('keydown',this.onKeyDown,true);
    const help=[...panel.querySelectorAll('p')].find(p=>!p.hasAttribute('data-rig-info'));for(const node of [panel.querySelector('[data-group]').parentElement,this.select.parentElement,this.readout,panel.querySelector('.rig-coordinates'),panel.querySelector('[data-frame]').parentElement])panel.insertBefore(node,help);
    const scroll=document.createElement('div');scroll.className='rig-scroll';const footer=document.createElement('div');footer.className='rig-footer';footer.append(panel.querySelector('[data-save]'),this.status);for(const child of [...panel.children])if(!['HEADER','H2'].includes(child.tagName))scroll.append(child);panel.append(scroll,footer);
    this.fillPoints();
  }
}

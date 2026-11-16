import * as THREE from 'three/webgpu';
import {TOOL_ATTACHMENTS,TOOL_ATTACHMENT_SCHEMA,validToolAttachments} from './ToolAttachmentSchema.js';
import {RigOrbitControls} from './RigOrbitControls.js';
import './tool-editor.css';

const KEY='legado.aleijadinho.tools.v1',ENDPOINT='/__reference/aleijadinho-tools',PUBLISHED='/attachments/aleijadinho.json';
const axes=['x','y','z'];
export class AleijadinhoToolEditor {
 constructor(character){
  this.c=character;this.items=TOOL_ATTACHMENTS.map(spec=>({...spec,...character.toolAttachments.find(item=>item.id===spec.id)}));
  this.defaults=new Map(this.items.map(item=>[item.id,{position:item.object.position.clone(),quaternion:item.object.quaternion.clone()}]));
  this.selected='mallet';this.editing=false;this.preview=false;this.zoom=1;this.orbitYaw=-.6;this.orbitPitch=.15;this.frame='item';
 }
 get item(){return this.items.find(item=>item.id===this.selected);}
 read(item){
  const scale=item.object.parent.getWorldScale(new THREE.Vector3()).multiplyScalar(100);
  return {id:item.id,bone:item.bone,positionCm:item.object.position.clone().multiply(scale).toArray(),rotationDeg:new THREE.Euler().setFromQuaternion(item.object.quaternion,'XYZ').toArray().slice(0,3).map(THREE.MathUtils.radToDeg)};
 }
 write(item,record){
  const parent=item.object.parent,source=this.c.bones[record.bone];
  const scale=source.getWorldScale(new THREE.Vector3()).multiplyScalar(100);
  const position=new THREE.Vector3().fromArray(record.positionCm).divide(scale),rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(...record.rotationDeg.map(THREE.MathUtils.degToRad),'XYZ'));
  if(source!==parent){
   parent.updateWorldMatrix(true,false);source.updateWorldMatrix(true,false);
   const local=new THREE.Matrix4().copy(parent.matrixWorld).invert().multiply(source.matrixWorld).multiply(new THREE.Matrix4().compose(position,rotation,item.object.scale));
   local.decompose(item.object.position,item.object.quaternion,item.object.scale);
  }else{item.object.position.copy(position);item.object.quaternion.copy(rotation);}
  item.object.updateWorldMatrix(true,true);
 }
 changed(){this.c.hitKey='';this.c.strike?.refreshToolAxes();}
 adopt(data){if(!validToolAttachments(data))return false;for(const item of this.items)this.write(item,data.items.find(record=>record.id===item.id));this.changed();this.savedAt=data.createdAt;return true;}
 snapshot(){return {schema:TOOL_ATTACHMENT_SCHEMA,characterId:'aleijadinho',createdAt:new Date().toISOString(),units:{position:'centimeters',rotation:'degrees',space:'parent-bone-local'},items:this.items.map(item=>this.read(item))};}
 async load(){
  let local;try{local=JSON.parse(localStorage.getItem(KEY));}catch{}
  const candidates=await Promise.all([ENDPOINT,PUBLISHED].map(async url=>{try{const response=await fetch(url,{cache:'no-store'});if(response.ok)return await response.json();}catch{}return null;}));
  const saved=[local,...candidates].filter(validToolAttachments).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
  if(saved){const time=this.c.time,playing=this.c.playing;this.c.playing=false;this.c.seek(0);this.adopt(saved);this.c.seek(time);this.c.playing=playing;}
 }
 async save(){
  const data=this.snapshot();let localSaved=false;try{localStorage.setItem(KEY,JSON.stringify(data));localSaved=true;}catch{}
  this.say('Salvando…');
  try{
   const response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),result=await response.json();if(!response.ok||!result.saved)throw new Error(result.error??'Falha ao salvar.');
   this.savedAt=data.createdAt;this.dirty=false;this.say('Salvo no projeto. Os itens serão carregados nesta posição.');return true;
  }catch{this.say(localSaved?'Salvo neste navegador. Não foi possível gravar no projeto; use Exportar JSON.':'Não foi possível salvar. Use Exportar JSON.');return false;}
 }
 say(text){if(this.panel)this.panel.querySelector('[data-status]').textContent=text;}
 pause(){this.preview=false;this.c.playing=false;for(const chip of this.c.chips??[])chip.m.visible=false;this.syncPlayback();}
 setValue(property,index,value){
  if(!Number.isFinite(value))return;this.pause();const record=this.read(this.item),limit=property==='positionCm'?100:180;
  record[property][index]=THREE.MathUtils.clamp(value,-limit,limit);this.write(this.item,record);this.changed();this.dirty=true;this.syncFields();this.say('Ajustes ainda não salvos.');
 }
 select(id){this.selected=id;this.panel.querySelector('[data-item]').value=id;this.orbitYaw=this.item.bone.startsWith('Right')?-.6:.6;this.frame='item';this.zoom=1;this.syncFields();this.focus();}
 reset(){this.pause();const original=this.defaults.get(this.selected);this.item.object.position.copy(original.position);this.item.object.quaternion.copy(original.quaternion);this.changed();this.dirty=true;this.syncFields();this.say('Item restaurado. Salve para manter.');}
 open(){
  if(this.editing)return;this.game.rigEditor?.editor?.close();this.old={paused:this.game.state.paused,rigEditing:this.game.state.rigEditing,playing:this.c.playing,cam:window.__camOverride};this.game.clearKeys();
  this.editing=true;this.game.state.paused=true;this.game.state.rigEditing=true;this.pause();this.panel.hidden=false;document.body.classList.add('tool-editing');this.syncFields();this.focus();
 }
 close(){
  if(!this.editing)return;this.orbit.endAll();this.editing=false;this.preview=false;this.panel.hidden=true;document.body.classList.remove('tool-editing');
  Object.assign(this.game.state,{paused:this.old.paused,rigEditing:this.old.rigEditing});this.c.playing=this.old.playing;window.__camOverride=this.old.cam;this.c.update(0);
 }
 focus(){
  if(!this.editing)return;const mobile=innerWidth<700,T=THREE;let at,distance;
  if(this.frame==='body'){at=this.c.bones.Hips.getWorldPosition(new T.Vector3()).lerp(this.c.bones.Head.getWorldPosition(new T.Vector3()),.5);distance=mobile?5:3.5;}
  else{const box=new T.Box3().setFromObject(this.item.object);at=box.getCenter(new T.Vector3()).lerp(this.item.object.parent.getWorldPosition(new T.Vector3()),.25);distance=Math.max(1.3,box.getSize(new T.Vector3()).length()*2);if(mobile)distance*=1.55;}
  if(mobile)at.y-=this.frame==='body'?.65:.38;
  const direction=new T.Vector3(Math.sin(this.orbitYaw)*Math.cos(this.orbitPitch),Math.sin(this.orbitPitch),Math.cos(this.orbitYaw)*Math.cos(this.orbitPitch)).applyQuaternion(this.c.holder.getWorldQuaternion(new T.Quaternion()));
  window.__camOverride={pos:at.clone().addScaledVector(direction,distance/this.zoom).toArray(),at:at.toArray(),fov:40};
 }
 syncFields(){
  if(!this.panel)return;const record=this.read(this.item);for(const input of this.panel.querySelectorAll('[data-property]'))if(document.activeElement!==input)input.value=record[input.dataset.property][Number(input.dataset.axis)].toFixed(2);
  this.panel.querySelector('[data-anchor]').textContent='Preso ao '+(this.item.bone.endsWith('Hand')?'punho ':'antebraço ')+(this.item.bone.startsWith('Right')?'direito':'esquerdo')+'. Os eixos acompanham o braço.';
 }
 syncPlayback(){if(this.panel){this.panel.querySelector('[data-play]').textContent=this.preview?'Pausar animação':'Testar animação';this.panel.querySelector('[data-time]').value=this.c.time;this.panel.querySelector('[data-clock]').textContent=this.c.time.toFixed(2)+' s';}}
 update(){if(this.editing){this.focus();this.syncPlayback();}}
 mount(game){
  this.game=game;game.toolEditor=this;const button=document.createElement('button');button.id='tools-toggle';button.textContent='Itens';button.title='Ajustar os itens nos braços do Aleijadinho';button.onclick=()=>this.editing?this.close():this.open();document.querySelector('.controls').append(button);
  const panel=document.createElement('section');this.panel=panel;panel.id='tools-editor';panel.hidden=true;panel.setAttribute('aria-label','Itens nos braços do Aleijadinho');
  const fields=(property,title,unit,limit,step)=>`<fieldset><legend>${title} · ${unit}</legend>${axes.map((axis,index)=>`<label class="tool-axis"><span>${axis.toUpperCase()}</span><input type="range" min="-${limit}" max="${limit}" step="${step}" data-property="${property}" data-axis="${index}" aria-label="${title} ${axis.toUpperCase()}"><input type="number" min="-${limit}" max="${limit}" step="${step}" data-property="${property}" data-axis="${index}" aria-label="${title} ${axis.toUpperCase()} em ${unit}"></label>`).join('')}</fieldset>`;
  panel.innerHTML=`<header><span>ITENS · ALEIJADINHO</span><button data-close aria-label="Fechar ajustes dos itens">×</button></header><h2>Ajustar nos braços</h2><div class="tool-selection"><label>Item<select data-item>${this.items.map(item=>`<option value="${item.id}">${item.label}</option>`).join('')}</select></label><p data-anchor></p></div><div class="tool-scroll">${fields('positionCm','Posição','cm',100,.1)}${fields('rotationDeg','Rotação','graus',180,.5)}<div class="tool-row"><button data-frame="item">Ver item</button><button data-frame="body">Ver corpo</button><button data-opposite>Outro lado</button></div><p class="tool-hint">Arraste o fundo para girar a visão. Use a roda ou pinça para aproximar.</p><label>Girar visão<input type="range" data-orbit min="-180" max="180" step="1" value="-34"></label><label class="rig-zoom">Aproximação<input type="range" min=".55" max="2" step=".05" value="1"></label><button data-reset>Restaurar este item</button></div><footer><label class="tool-time">Momento do golpe<input data-time type="range" min="0" max="${this.c.clip.duration}" step=".01"><output data-clock></output></label><button data-play>Testar animação</button><div class="tool-row"><button data-export>Exportar JSON</button><button data-save>Salvar itens</button></div><p data-status role="status">${this.savedAt?'Seus itens salvos foram carregados.':'Ajuste cada item e salve para usar na cena.'}</p></footer>`;
  document.body.append(panel);this.orbit=new RigOrbitControls(this);
  panel.querySelector('[data-close]').onclick=()=>this.close();panel.querySelector('[data-item]').onchange=event=>this.select(event.target.value);
  for(const input of panel.querySelectorAll('[data-property]')){input.oninput=()=>{if(input.value!=='')this.setValue(input.dataset.property,Number(input.dataset.axis),input.valueAsNumber);};input.onblur=()=>this.syncFields();}
  for(const button of panel.querySelectorAll('[data-frame]'))button.onclick=()=>{this.frame=button.dataset.frame;this.zoom=1;this.focus();};
  panel.querySelector('[data-opposite]').onclick=()=>{this.orbitYaw+=Math.PI;this.focus();this.orbit.sync();};
  panel.querySelector('[data-orbit]').oninput=event=>{this.orbitYaw=THREE.MathUtils.degToRad(Number(event.target.value));this.focus();};
  panel.querySelector('.rig-zoom input').oninput=event=>{this.zoom=Number(event.target.value);this.focus();};
  panel.querySelector('[data-reset]').onclick=()=>this.reset();panel.querySelector('[data-save]').onclick=()=>this.save();
  panel.querySelector('[data-play]').onclick=()=>{if(this.preview)this.pause();else{this.preview=true;this.c.playing=true;this.syncPlayback();}};
  panel.querySelector('[data-time]').oninput=event=>{this.pause();this.preview=true;this.c.seek(Number(event.target.value));this.preview=false;this.syncPlayback();};
  panel.querySelector('[data-export]').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(this.snapshot(),null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='aleijadinho-itens.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  if(new URLSearchParams(location.search).has('itens'))this.open();
 }
}

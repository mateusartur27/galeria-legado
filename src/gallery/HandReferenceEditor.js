import * as THREE from 'three/webgpu';

const KEY = 'legado.machado.handReference.v1';
const PHASE_KEY = 'legado.machado.handReference.v2';
const blank = () => ({position:[0,0,0],rotation:[0,0,0]});
const defaults = () => ({time:2,left:blank(),right:blank(),pen:blank()});
const nameKey = n => n.replace(/[^a-zA-Z0-9]/g,'');
const rad = THREE.MathUtils.degToRad;
const nonzero = o => [...o.position,...o.rotation].some(v=>Math.abs(v)>1e-9);
export const thinkingWeight = t => {
  const s=x=>{x=THREE.MathUtils.clamp(x,0,1);return x*x*(3-2*x)};
  return s((t-11.6)/1.2)*(1-s((t-14)/1.3));
};
const phaseAt = t => thinkingWeight(t)>=.5?'thinking':'writing';

export class HandReferenceEditor {
  constructor(animation,{interactive=true,profiles=null}={}) {
    this.animation=animation;this.entry=animation.entry;this.settings=defaults();this.restored=[];this.selected='left';this.interactive=interactive;
    this.phases=structuredClone(profiles??{writing:{left:blank(),right:blank(),pen:blank()},thinking:{left:blank(),right:blank(),pen:blank()}});
    this.limited=false;this.penHeightShift=0;
    if(interactive)try {
      const saved=JSON.parse(localStorage.getItem(KEY));
      const separate=JSON.parse(localStorage.getItem(PHASE_KEY));
      const validate=(target,adjustments)=>{
        for(const k of ['left','right','pen'])for(const field of ['position','rotation']){
          const a=adjustments?.[k]?.[field];
          if(Array.isArray(a)&&a.length===3&&a.every(Number.isFinite))target[k][field]=a.map(v=>THREE.MathUtils.clamp(v,field==='position'?-.3:-180,field==='position'?.3:180));
        }
      };
      if(separate?.schema==='machado-hand-reference/v2') {
        for(const p of ['writing','thinking'])validate(this.phases[p],separate.phases?.[p]);
        if(Number.isFinite(separate.sampleTime))this.settings.time=THREE.MathUtils.clamp(separate.sampleTime,0,17.99);
      } else if(saved?.schema==='machado-hand-reference/v1') {
        const p=saved.moment==='thinking'||saved.moment==='writing'?saved.moment:phaseAt(saved.sampleTime??2);
        validate(this.phases[p],saved.adjustments);
        if(Number.isFinite(saved.sampleTime))this.settings.time=THREE.MathUtils.clamp(saved.sampleTime,0,17.99);
      }
    } catch {}
    this.activatePhase(this.settings.time);
    this.bones=Object.values(animation.bones);
    const depth=b=>b.parent?.isBone?1+depth(b.parent):0;
    this.bones.sort((a,b)=>depth(a)-depth(b));
    if(interactive){this.mount();animation.playing=false;animation.seek(this.settings.time);this.focus();}
    else this.limitText={textContent:''};
  }
  activatePhase(t) {
    this.phase=phaseAt(t);this.settings={time:t,...this.phases[this.phase]};
    if(this.phaseText)this.phaseText.textContent=this.phase==='thinking'?'Ajustando: pensamento':'Ajustando: escrita';
  }
  syncPose(t) {
    const w=thinkingWeight(t);this.weight=w;this.poseSettings={};
    for(const k of ['left','right','pen']){
      this.poseSettings[k]=blank();
      for(const field of ['position','rotation'])for(let i=0;i<3;i++)this.poseSettings[k][field][i]=THREE.MathUtils.lerp(this.phases.writing[k][field][i],this.phases.thinking[k][field][i],w);
    }
  }
  bone(name) {return this.animation.bones[nameKey(name)];}
  restore() {
    for(const [b,p,q,s] of this.restored){b.position.copy(p);b.quaternion.copy(q);b.scale.copy(s);}
    this.restored.length=0;
  }
  stageMatrix(b,inv) {return new THREE.Matrix4().multiplyMatrices(inv,b.matrixWorld);}
  position(m) {return new THREE.Vector3().setFromMatrixPosition(m);}
  aim(m,from,to,head) {
    const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();m.decompose(p,q,s);
    q.premultiply(new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(),to.clone().normalize()));
    return new THREE.Matrix4().compose(head,q,s);
  }
  applyHands() {
    const settings=this.poseSettings??this.settings;
    this.limited=false;this.penHeightShift=0;
    this.limitText.textContent='';
    if(!nonzero(settings.left)&&!nonzero(settings.right))return;
    const entry=this.entry.group;entry.updateMatrixWorld(true);
    const inv=entry.matrixWorld.clone().invert();
    const mats=new Map(this.bones.map(b=>[b,this.stageMatrix(b,inv)]));
    const index=this.bone('DEF-f_index.03.L'),thumb=this.bone('DEF-thumb.03.L');
    const baseGrip=this.position(mats.get(index)).lerp(this.position(mats.get(thumb)),.5);
    for(const [key,side] of [['left','L'],['right','R']]) {
      const cfg=settings[key];if(!nonzero(cfg))continue;
      const u=this.bone('DEF-upper_arm.'+side),u2=this.bone('DEF-upper_arm.'+side+'.001');
      const f=this.bone('DEF-forearm.'+side),f2=this.bone('DEF-forearm.'+side+'.001'),h=this.bone('DEF-hand.'+side);
      const um=mats.get(u),fm=mats.get(f),hm=mats.get(h);
      const shoulder=this.position(um),oldElbow=this.position(fm),oldWrist=this.position(hm);
      const upper=oldElbow.clone().sub(shoulder),lower=oldWrist.clone().sub(oldElbow),l1=upper.length(),l2=lower.length();
      let wrist=oldWrist.clone().add(new THREE.Vector3(...cfg.position));
      const v=wrist.clone().sub(shoulder),raw=v.length(),dist=THREE.MathUtils.clamp(raw,Math.abs(l1-l2)+.001,l1+l2-.0005);
      if(Math.abs(dist-raw)>.001)this.limited=true;
      const axis=v.normalize();if(raw<1e-8)axis.copy(lower).normalize();wrist=shoulder.clone().addScaledVector(axis,dist);
      const pole=oldElbow.clone().sub(shoulder);pole.addScaledVector(axis,-pole.dot(axis));
      if(pole.lengthSq()<1e-8)pole.crossVectors(axis,new THREE.Vector3(0,1,0));
      if(pole.lengthSq()<1e-8)pole.set(side==='L'?1:-1,0,0);
      pole.normalize();
      const along=(l1*l1-l2*l2+dist*dist)/(2*dist),rise=Math.sqrt(Math.max(0,l1*l1-along*along));
      const elbow=shoulder.clone().addScaledVector(axis,along).addScaledVector(pole,rise);
      const uu=elbow.clone().sub(shoulder),ff=wrist.clone().sub(elbow);
      const ratioU=this.position(mats.get(u2)).distanceTo(shoulder)/l1;
      const ratioF=this.position(mats.get(f2)).distanceTo(oldElbow)/l2;
      mats.set(u,this.aim(um,upper,uu,shoulder));mats.set(u2,this.aim(mats.get(u2),upper,uu,shoulder.clone().addScaledVector(uu,ratioU)));
      mats.set(f,this.aim(fm,lower,ff,elbow));mats.set(f2,this.aim(mats.get(f2),lower,ff,elbow.clone().addScaledVector(ff,ratioF)));
      const pos=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3();hm.decompose(pos,q,scale);
      q.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...cfg.rotation.map(rad),'XYZ')));
      const hand=new THREE.Matrix4().compose(wrist,q,scale),delta=hand.clone().multiply(hm.clone().invert());
      mats.set(h,hand);
      for(const b of this.bones) {
        const n=nameKey(b.name);
        if(['DEFfindex','DEFfmiddle','DEFfring','DEFfpinky','DEFthumb'].some(prefix=>n.startsWith(prefix))&&n.endsWith(side))mats.set(b,delta.clone().multiply(mats.get(b)));
      }
    }
    const grip=this.position(mats.get(index)).lerp(this.position(mats.get(thumb)),.5);
    this.penHeightShift=grip.y-baseGrip.y;
    const world=new Map([...mats].map(([b,m])=>[b,entry.matrixWorld.clone().multiply(m)]));
    for(const b of this.bones) {
      this.restored.push([b,b.position.clone(),b.quaternion.clone(),b.scale.clone()]);
      const parent=world.get(b.parent)??b.parent.matrixWorld;
      const local=parent.clone().invert().multiply(world.get(b));local.decompose(b.position,b.quaternion,b.scale);
    }
    entry.updateMatrixWorld(true);
    this.limitText.textContent=this.limited?'O braço chegou ao limite. Aproxime a mão do corpo.':'';
  }
  applyPen() {
    const cfg=(this.poseSettings??this.settings).pen,p=this.animation.pen;
    p.position.add(new THREE.Vector3(...cfg.position));
    p.quaternion.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...cfg.rotation.map(rad),'XYZ')));
  }
  focus() {
    const g=window.__game;if(!g)return;
    g.state.paused=true;g.state.exploring=true;g.state.camX=this.entry.side*4.45;g.state.eye=1.20;
    g.state.yaw=g.state.targetYaw=-this.entry.side*Math.PI/2;
    g.state.pitch=g.state.targetPitch=-.08;
  }
  refresh() {this.animation.playing=false;this.animation.seek(this.settings.time);this.saveStatus.textContent='Alterações ainda não salvas.';}
  snapshot() {
    const a=this.animation;this.settings.time=a.time;a.update(0);this.entry.group.updateMatrixWorld(true);
    const inv=this.entry.group.matrixWorld.clone().invert();
    return {schema:'machado-hand-reference/v1',createdAt:new Date().toISOString(),character:'Machado de Assis',
      sampleTime:a.time,moment:this.phase,source:'Mixamo Writing',clip:a.clip.name,units:'meters',rotationUnits:'degrees',coordinateSpace:'set-local +Y up +Z toward corridor',
      adjustments:structuredClone({left:this.settings.left,right:this.settings.right,pen:this.settings.pen}),
      holder:{position:a.holder.position.toArray(),scale:a.holder.scale.toArray()},
      pen:{position:a.pen.position.toArray(),quaternion:a.pen.quaternion.toArray()},
      bonePoses:this.bones.map(b=>({name:b.name,setMatrix:this.stageMatrix(b,inv).toArray(),local:{position:b.position.toArray(),quaternion:b.quaternion.toArray(),scale:b.scale.toArray()}})),
      desk:this.entry.room.desk?.all?.()??null};
  }
  async save() {
    this.animation.playing=false;this.panel.querySelector('[data-play]').textContent='Reproduzir';
    const reference=this.snapshot();localStorage.setItem(KEY,JSON.stringify(reference));
    localStorage.setItem(PHASE_KEY,JSON.stringify({schema:'machado-hand-reference/v2',sampleTime:this.animation.time,phases:this.phases}));
    this.saveStatus.textContent='Salvando referência…';
    let projectSaved=false;
    try {
      const response=await fetch('/__reference/machado-hands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(reference)});
      projectSaved=response.ok&&(await response.json()).saved===true;
    } catch {}
    const url=URL.createObjectURL(new Blob([JSON.stringify(reference,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='machado-referencia-maos.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
    this.saveStatus.textContent=projectSaved?'Referência salva na pasta do projeto. Uma cópia JSON também foi baixada.':'Referência guardada neste navegador e baixada como arquivo JSON.';
    return reference;
  }
  mount() {
    document.body.classList.add('hand-reference-edit');
    const panel=document.createElement('section');panel.id='hand-reference-editor';panel.setAttribute('aria-label','Ajustar mãos e pena');
    panel.innerHTML=`<style>
    .hand-reference-edit #desk-panel{display:none!important}
    #hand-reference-editor{position:fixed;left:14px;top:100px;z-index:45;width:282px;max-height:calc(100vh - 125px);overflow:auto;padding:16px;box-sizing:border-box;border:1px solid #79623e;border-radius:14px;background:rgba(27,23,19,.96);color:#f1e7d5;font:13px/1.4 system-ui,sans-serif;box-shadow:0 8px 35px #0007}
    #hand-reference-editor h3{font:600 17px Georgia,serif;margin:0 0 6px}#hand-reference-editor p{margin:5px 0 12px;color:#cbbda9;font-size:12px}
    #hand-reference-editor button,#hand-reference-editor select,#hand-reference-editor input[type=number]{font:inherit;border:1px solid #6b5a43;border-radius:6px;background:#382d23;color:#f5e9d4;padding:6px}
    #hand-reference-editor select{width:100%;margin:5px 0 10px}#hand-reference-editor button{cursor:pointer}#hand-reference-editor button:hover{background:#574333}
    #hand-reference-editor .row{display:flex;gap:7px;margin:8px 0}#hand-reference-editor .row button{flex:1;font-size:12px}
    #hand-reference-editor input[type=range]{width:100%;accent-color:#d5ae6b;margin:5px 0 9px}#hand-reference-editor label{display:flex;align-items:center;justify-content:space-between;gap:8px}
    #hand-reference-editor input[type=number]{width:72px;box-sizing:border-box;text-align:right;padding:3px 4px}#hand-reference-editor .field{margin:5px 0}
    #hand-reference-editor details{margin:8px 0 12px}#hand-reference-editor summary{cursor:pointer;color:#dbba7c}#hand-reference-editor .save{width:100%;background:#d7b36f;color:#211b13;font-weight:700;padding:10px}
    #hand-reference-editor .status{font-size:11px;min-height:28px;margin:8px 0 0;color:#d8c6a2}#hand-reference-editor .limit{font-size:11px;color:#f0b88b}
    @media(max-width:700px){#hand-reference-editor{top:auto;bottom:10px;max-height:45vh;width:calc(100vw - 24px);left:12px}.hand-reference-edit #controls{display:none}}
    </style><h3>Ajustar mãos e pena</h3><p>A animação começa congelada. Mova cada peça e salve a referência quando estiver como você quer.</p>
    <label>Momento da animação <output data-time></output></label><input aria-label="Momento da animação" data-time-slider type="range" min="0" max="17.99" step="0.01">
    <div class="row"><button data-pose="2">Escrita</button><button data-pose="13.5">Pensamento</button><button data-play>Reproduzir</button></div>
    <p data-phase></p><label for="hand-reference-object">Peça que deseja mover</label><select id="hand-reference-object"><option value="left">Mão esquerda · escrita</option><option value="right">Mão direita</option><option value="pen">Pena</option></select>
    <div data-position></div><details><summary>Girar a peça</summary><div data-rotation></div></details><div class="limit" aria-live="polite"></div>
    <div class="row"><button data-reset>Restaurar esta peça</button><button data-focus>Enquadrar mãos</button></div>
    <button class="save" data-save>Salvar referência</button><p class="status" aria-live="polite">Salvar guarda os ajustes e baixa um arquivo para eu usar como referência.</p>`;
    document.body.append(panel);this.panel=panel;this.saveStatus=panel.querySelector('.status');this.limitText=panel.querySelector('.limit');
    this.phaseText=panel.querySelector('[data-phase]');this.activatePhase(this.settings.time);
    this.inputs=[];
    for(const [field,labels,limit,step,unit] of [['position',['Lado ↔ lado','Altura','Frente ↔ fundo'],30,.1,'cm'],['rotation',['Giro em X','Giro em Y','Giro em Z'],180,1,'°']]) {
      for(let i=0;i<3;i++) {
        const wrap=document.createElement('div');wrap.className='field';
        const id=`reference-${field}-${i}`;
        wrap.innerHTML=`<label for="${id}"><span>${labels[i]} (${unit})</span><input aria-label="${labels[i]} em ${unit}" type="number" min="${-limit}" max="${limit}" step="${step}"></label><input id="${id}" type="range" min="${-limit}" max="${limit}" step="${step}">`;
        const slider=wrap.querySelector('[type=range]'),number=wrap.querySelector('[type=number]');
        const change=value=>{if(!Number.isFinite(value))return;value=THREE.MathUtils.clamp(value,-limit,limit);this.settings[this.selected][field][i]=field==='position'?value/100:value;slider.value=value;number.value=value;this.refresh();};
        slider.oninput=()=>change(+slider.value);number.oninput=()=>change(+number.value);
        this.inputs.push({field,i,slider,number});panel.querySelector('[data-'+field+']').append(wrap);
      }
    }
    this.timeInput=panel.querySelector('[data-time-slider]');this.timeOutput=panel.querySelector('[data-time]');this.timeInput.value=this.settings.time;this.timeOutput.textContent=this.settings.time.toFixed(2)+' s';
    this.timeInput.oninput=()=>this.setTime(+this.timeInput.value);
    for(const b of panel.querySelectorAll('[data-pose]'))b.onclick=()=>this.setTime(+b.dataset.pose);
    panel.querySelector('[data-play]').onclick=e=>{this.animation.playing=!this.animation.playing;e.target.textContent=this.animation.playing?'Congelar':'Reproduzir';};
    panel.querySelector('select').onchange=e=>{this.selected=e.target.value;this.syncInputs();};
    panel.querySelector('[data-reset]').onclick=()=>{this.phases[this.phase][this.selected]=this.settings[this.selected]=blank();this.syncInputs();this.refresh();};
    panel.querySelector('[data-focus]').onclick=()=>this.focus();
    panel.querySelector('[data-save]').onclick=async()=>{try{await this.save();}catch(err){this.saveStatus.textContent='Não foi possível salvar: '+err.message;}};
    this.syncInputs();
  }
  setTime(t) {this.activatePhase(t);this.syncInputs();this.timeInput.value=t;this.timeOutput.textContent=t.toFixed(2)+' s';this.panel.querySelector('[data-play]').textContent='Reproduzir';this.refresh();}
  syncInputs() {for(const {field,i,slider,number} of this.inputs){const v=this.settings[this.selected][field][i]*(field==='position'?100:1);slider.value=v;number.value=Number(v.toFixed(2));}}
  syncTime() {if(this.animation.playing){const t=this.animation.time;if(phaseAt(t)!==this.phase){this.activatePhase(t);this.syncInputs();}this.settings.time=t;this.timeInput.value=t;this.timeOutput.textContent=t.toFixed(2)+' s';}}
}

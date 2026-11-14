import * as THREE from 'three/webgpu';

const clean=n=>n.replace(/[^a-z0-9]/gi,'').toLowerCase();
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);

// Runtime counterpart of the rest-joint editor. Bind corrections keep the rest
// mesh intact; offsets are applied to the sampled animation before the tool IK.
export class SavedRigCalibration {
  constructor(animation){
    this.animation=animation;this.bones=animation.restPose.map(([b])=>b);this.base=new Map(animation.restPose.map(([b,p,q,s])=>[b,{p:p.clone(),q:q.clone(),s:s.clone()}]));
    this.byName=new Map(this.bones.map(b=>[clean(b.name),b]));this.previous=[];this.offsets=new Map();this.status={loaded:false,changedBones:0};
    const skeletons=new Set();animation.root.traverse(n=>{if(n.isSkinnedMesh)skeletons.add(n.skeleton);});this.skeletons=[...skeletons].map(s=>({s,inverses:s.boneInverses.map(m=>m.clone())}));
    const pose=this.capture();this.putRest();animation.holder.updateWorldMatrix(true,true);const inv=animation.holder.matrixWorld.clone().invert();
    this.originalMatrices=new Map(this.bones.map(b=>[b,inv.clone().multiply(b.matrixWorld)]));this.restore(pose);
  }
  capture(){return this.bones.map(b=>[b,b.position.clone(),b.quaternion.clone(),b.scale.clone()]);}
  restore(pose){for(const [b,p,q,s] of pose){b.position.copy(p);b.quaternion.copy(q);b.scale.copy(s);}this.animation.root.updateMatrixWorld(true);}
  putRest(){for(const [b,v] of this.base){b.position.copy(v.p);b.quaternion.copy(v.q);b.scale.copy(v.s);}}
  restoreFrame(){if(this.previous.length){this.restore(this.previous);this.previous=[];}}
  apply(){
    if(!this.status.loaded)return;this.previous=this.capture();for(const [b,v] of this.offsets)b.position.add(v);this.animation.root.updateMatrixWorld(true);
  }
  setReference(reference){
    if(!['character-rig/v2','aleijadinho-rig/v1'].includes(reference?.schema)||reference.mode!=='rest-joint-calibration'||reference.characterId&&reference.characterId!==this.animation.entry.character.id||!Array.isArray(reference.bones)||reference.bones.length!==this.bones.length)throw new Error('O rig salvo não corresponde ao personagem.');
    const positions=new Map();
    for(const record of reference.bones){const b=this.byName.get(clean(record.sourceName??record.name));if(!b||positions.has(b)||!vector(record.position)||!vector(record.originalPosition))throw new Error('Articulação inválida no rig salvo.');
      if(this.base.get(b).p.distanceTo(new THREE.Vector3(...record.originalPosition))>.001)throw new Error('O modelo do rig salvo é diferente do modelo do set.');positions.set(b,new THREE.Vector3(...record.position));}
    this.restoreFrame();const pose=this.capture();this.putRest();for(const [b,p] of positions)b.position.copy(p);this.animation.holder.updateWorldMatrix(true,true);this.animation.root.updateMatrixWorld(true);
    this.animation.strike?.refreshRigAxes();
    const inv=this.animation.holder.matrixWorld.clone().invert(),matrices=new Map(this.bones.map(b=>[b,inv.clone().multiply(b.matrixWorld)]));
    for(const {s,inverses} of this.skeletons){s.boneInverses=s.bones.map((b,i)=>matrices.get(b).clone().invert().multiply(this.originalMatrices.get(b)).multiply(inverses[i]));s.update();}
    this.offsets=new Map([...positions].map(([b,p])=>[b,p.clone().sub(this.base.get(b).p)]));
    this.status={loaded:true,savedAt:reference.createdAt,changedBones:[...this.offsets.values()].filter(v=>v.lengthSq()>1e-10).length};this.restore(pose);
    // Invalidate mixer caches after editing bones outside the animation mixer.
    const a=this.animation;a.action.stop().play();a.mixer.setTime(a.time);a.update(0);
    return this.status;
  }
  async load(){
    const id=this.animation.entry.character.id;
    const candidates=await Promise.all([`/__reference/${id}-rig`,`/rigs/${id}.json`].map(async url=>{try{const r=await fetch(url,{cache:'no-store'});if(r.ok)return await r.json();}catch{}return null;}));
    const reference=candidates.filter(r=>r?.mode==='rest-joint-calibration').sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];if(reference)this.setReference(reference);return this.status;
  }
}

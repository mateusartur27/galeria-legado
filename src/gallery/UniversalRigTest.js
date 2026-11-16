import * as THREE from 'three/webgpu';

const V=THREE.Vector3,Q=THREE.Quaternion,M=THREE.Matrix4;
const clean=n=>n.replace(/[^a-z0-9]/gi,'').toLowerCase();
const sideOf=n=>/^left|l(?:001)?$/.test(clean(n))?1:/^right|r(?:001)?$/.test(clean(n))?-1:0;
const finger=n=>/thumb|index|middle|ring|pinky/.test(clean(n));
const roleOf=n=>{
 const k=clean(n).replace(/^def/,'');if(finger(n))return 'finger';
 if(k==='hips'||k==='spine')return k==='spine'&&/^DEF/i.test(n)?'hips':k==='hips'?'hips':'spine';
 if(/^spine006$/.test(k))return 'head';if(/^spine00[45]$/.test(k))return 'neck';if(/^spine0?0?1$/.test(k))return 'spine';if(/^spine/.test(k))return 'chest';if(/neck/.test(k))return 'neck';if(/head/.test(k))return 'head';
 if(/shoulder/.test(k))return 'shoulder';if(/upperarm|(?:left|right)arm/.test(k))return 'arm';if(/forearm/.test(k))return 'forearm';if(/hand/.test(k))return 'hand';
 if(/thigh|upleg/.test(k))return 'thigh';if(/shin|(?:left|right)leg/.test(k))return 'shin';if(/foot/.test(k))return 'foot';if(/toe/.test(k))return 'toe';return 'other';
};
const smooth=x=>{x=THREE.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
const segmentDistance=(p,a,b)=>{const d=b.clone().sub(a),u=THREE.MathUtils.clamp(p.clone().sub(a).dot(d)/Math.max(d.lengthSq(),1e-9),0,1);return p.distanceToSquared(a.clone().addScaledVector(d,u));};

export class UniversalRigTest {
 constructor(animation){this.a=animation;this.rootPosition=animation.root.position.clone();this.revision=-1;this.skin=null;this.lastPhase='';}
 duration(mode){return mode==='runJump'?6:mode==='all'?15:3;}
 prepare(){
  const e=this.a.rigEditor;if(this.revision===e.rigRevision)return;
  this.releaseSkin();this.a.root.position.copy(this.rootPosition);e.rest();const holder=this.a.holder;holder.updateWorldMatrix(true,true);const inv=holder.matrixWorld.clone().invert();
  this.rest=new Map(e.bones.map(b=>{const mat=inv.clone().multiply(b.matrixWorld),p=new V(),q=new Q(),s=new V();mat.decompose(p,q,s);return [b,{mat,p,q,s,role:roleOf(b.name),side:sideOf(b.name)}];}));
  this.bones=e.bones;this.hips=this.bones.find(b=>this.rest.get(b).role==='hips');this.feet=this.bones.filter(b=>['foot','toe'].includes(this.rest.get(b).role));
  this.footY=Math.min(...this.feet.map(b=>this.rest.get(b).p.y));this.fingers=this.bones.filter(b=>finger(b.name));
  this.hands=new Map([1,-1].map(side=>[side,this.bones.find(b=>{const r=this.rest.get(b);return r.role==='hand'&&r.side===side;})]));
  for(const b of this.bones){const r=this.rest.get(b),child=b.children.find(c=>c.isBone&&this.rest.has(c));
   const end=child&&r.role!=='hand'?this.rest.get(child).p.clone():r.p.clone().add((b.parent.isBone&&this.rest.has(b.parent)?r.p.clone().sub(this.rest.get(b.parent).p):new V(0,.05,0)).multiplyScalar(.6));
   r.end=end;r.direction=end.clone().sub(r.p).normalize();if(r.direction.lengthSq()<.5)r.direction.set(0,1,0);
   r.curlAxis=new V().crossVectors(r.direction,new V(0,0,1)).normalize().applyQuaternion(r.q.clone().invert());if(r.curlAxis.lengthSq()<.5)r.curlAxis.set(1,0,0);
  }
  this.revision=e.rigRevision;
 }
 motion(time,mode){
  if(mode==='runJump'){if(time%6<3)return this.motion(time%6,'run');return this.motion(time%6-3,'jump');}
  const phase=mode==='all'?['walk','jump','arms','elbows','fingers'][Math.floor((time%15)/3)]:mode,t=time%3,w=t*Math.PI*2,beat=smooth(Math.sin(Math.PI*t/3));
  return {phase,t,w:phase==='run'?w*1.5:w,beat};
 }
 pose(time,mode='all'){
  this.prepare();const e=this.a.rigEditor;this.a.root.position.copy(this.rootPosition);e.rest();const {phase,t,w,beat}=this.motion(time,mode);this.lastPhase=phase;
  if(this.a.referenceOnly)this.ensureSkin();
  const holder=this.a.holder,holderQ=holder.getWorldQuaternion(new Q());
  let jump=0,crouch=0,lean=0;
  let anticipation=0,landing=0,air=0;
  if(phase==='run')lean=.22;
  if(phase==='jump'){const u=t/3;anticipation=smooth((u-.04)/.14)*(1-smooth((u-.22)/.12));landing=smooth((u-.69)/.1)*(1-smooth((u-.83)/.17));crouch=.07*anticipation+.055*landing;const flight=THREE.MathUtils.clamp((u-.28)/.43,0,1);air=Math.sin(Math.PI*flight);jump=.23*air;lean=.14*crouch/.07;}
  const desired=new Map();
  for(const b of this.bones){const r=this.rest.get(b),s=r.side,role=r.role;let dir=null,q=r.q.clone();
   if(['arm','forearm','hand'].includes(role)){
    let angle=0,bend=role==='forearm'||role==='hand'?.24:0,spread=.12;
    if(phase==='walk')angle=-s*Math.sin(w)*.38;
    if(phase==='run'){angle=-s*Math.sin(w)*.75;bend=role==='arm'?0:1.15;spread=.13;}
    if(phase==='jump'){angle=.65*air-.35*anticipation;spread=.12+.42*air;}
    if(phase==='arms'){spread=Math.sin(t/3*Math.PI)*.98;angle=Math.sin(w*.5)*.35;bend+=Math.max(0,Math.sin(w))*.8;}
    // Keep upper arms steady so elbow flexion is easy to inspect from the side.
    if(phase==='elbows'){angle=.1;spread=.14;bend=role==='arm'?0:.1+1.85*(.5-.5*Math.cos(w/3));}
    if(phase==='fingers'){angle=.7;spread=.22;bend=.65;}
    const down=-Math.sqrt(Math.max(.02,1-spread*spread));dir=new V(s*spread,down*Math.cos(angle+bend),Math.sin(angle+bend)).normalize();
   }else if(['thigh','shin','foot','toe'].includes(role)){
    let angle=phase==='walk'?s*Math.sin(w)*.43:0;
    if(phase==='run'){angle=s*Math.sin(w)*.85;if(['shin','foot','toe'].includes(role))angle-=Math.max(0,-s*Math.sin(w))*1.25;}
    if(phase==='walk'&&['shin','foot','toe'].includes(role))angle-=Math.max(0,-s*Math.sin(w))*.55;
    if(phase==='jump')angle=(role==='thigh'?.65:-.75)*(crouch/.07)+(role==='thigh'?.12:-.18)*air;
    if(['foot','toe'].includes(role))dir=r.direction.clone();else dir=new V(s*.018,-Math.cos(angle),Math.sin(angle));
   }else if(['spine','chest','neck','head'].includes(role)){
    q.premultiply(new Q().setFromAxisAngle(new V(1,0,0),lean*(role==='head'?.2:.4)));
    if(phase==='arms'&&role==='chest')q.premultiply(new Q().setFromAxisAngle(new V(0,1,0),Math.sin(w*.5)*.14));
   }
   if(dir)q.premultiply(new Q().setFromUnitVectors(r.direction,dir.normalize()));
   if(phase==='fingers'&&role==='hand')q.premultiply(new Q().setFromAxisAngle(dir.clone().normalize(),Math.sin(w)*.18));
   if(role!=='finger'&&role!=='other')desired.set(b,q);
  }
  for(const b of this.bones){if(!desired.has(b))continue;const parentQ=b.parent.getWorldQuaternion(new Q());b.quaternion.copy(parentQ.invert().multiply(holderQ.clone().multiply(desired.get(b))));b.updateWorldMatrix(false,true);}
  this.a.root.position.y+=jump-crouch+(phase==='run'?.025+Math.cos(w*2)*.018:phase==='walk'?Math.cos(w*2)*.006:0);holder.updateWorldMatrix(true,true);
  const min=Math.min(...this.feet.map(b=>holder.worldToLocal(b.getWorldPosition(new V())).y)),correction=this.footY+jump+(phase==='run'?.025*Math.abs(Math.cos(w)):0)-min;
  this.a.root.position.y+=correction;holder.updateWorldMatrix(true,true);
  // Rigify can export finger roots outside the hand hierarchy. Carry those roots
  // with the hand before curling, rather than leaving them in the original T-pose.
  for(const b of this.fingers){const r=this.rest.get(b),hand=this.hands.get(r.side);if(!hand||finger(b.parent.name))continue;let parent=b.parent,attached=false;while(parent){if(parent===hand)attached=true;parent=parent.parent;}if(attached)continue;
   const current=new M().multiplyMatrices(holder.matrixWorld.clone().invert(),hand.matrixWorld),delta=current.multiply(this.rest.get(hand).mat.clone().invert()),world=holder.matrixWorld.clone().multiply(delta).multiply(r.mat),local=b.parent.matrixWorld.clone().invert().multiply(world);local.decompose(b.position,b.quaternion,b.scale);b.updateWorldMatrix(false,true);
  }
  const curl=phase==='fingers'?.8*(.5-.5*Math.cos(w/3)):phase==='run'?.55:phase==='walk'?.15:phase==='arms'?.25*beat:0;
  for(const b of this.fingers){const r=this.rest.get(b);b.quaternion.multiply(new Q().setFromAxisAngle(r.curlAxis,curl*(/thumb/i.test(b.name)?.65:1)));b.updateWorldMatrix(false,true);}
  holder.updateWorldMatrix(true,true);this.a.root.updateMatrixWorld(true);
 }
 ensureSkin(){
  if(this.skin){this.showSkin(true);return;}
  const a=this.a,holder=a.holder;holder.updateWorldMatrix(true,true);const inverse=holder.matrixWorld.clone().invert(),skeleton=new THREE.Skeleton(this.bones),pairs=[],meshes=[];
  a.root.traverse(n=>{if(n.isMesh&&!n.isSkinnedMesh)meshes.push(n);});
  // Nearest-bone weights (original method) + a torso guard so the rib cage does not follow the arms.
  const lay=this.rest,armStart={},sm=x=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
  for(const b of this.bones){const r=lay.get(b);if(r.role==='arm'&&r.side&&!armStart[r.side])armStart[r.side]=r.p;}
  for(const mesh of meshes){
   const geometry=mesh.geometry.clone(),position=geometry.attributes.position,index=new Uint16Array(position.count*4),weight=new Float32Array(position.count*4),matrix=inverse.clone().multiply(mesh.matrixWorld),p=new V();
   for(let i=0;i<position.count;i++){
    p.fromBufferAttribute(position,i).applyMatrix4(matrix);let d0=Infinity,d1=Infinity,d2=Infinity,d3=Infinity,j0=0,j1=0,j2=0,j3=0;
    for(let j=0;j<this.bones.length;j++){const r=lay.get(this.bones[j]),dx=r.end.x-r.p.x,dy=r.end.y-r.p.y,dz=r.end.z-r.p.z,px=p.x-r.p.x,py=p.y-r.p.y,pz=p.z-r.p.z,u=Math.max(0,Math.min(1,(px*dx+py*dy+pz*dz)/(dx*dx+dy*dy+dz*dz+1e-12)));let d=(px-dx*u)**2+(py-dy*u)**2+(pz-dz*u)**2;
     if(p.y<.52&&r.side&&p.x*r.side<-.02)d+=1;
     // Rib cage / torso must not follow the arms: nearest-bone weights leak arm influence into the ribs.
     if(['arm','forearm','hand'].includes(r.role)){const s=armStart[r.side];if(s){const ax=Math.abs(s.x),inside=1-sm((Math.abs(p.x)-ax*.88)/(ax*.2)),below=1-sm((p.y-(s.y+.015))/.05);d+=1.5*Math.max(0,Math.min(1,inside))*Math.max(0,Math.min(1,below));}}if(p.y>.83&&['thigh','shin','foot','toe'].includes(r.role))d+=1;
     if(d<d0){d3=d2;j3=j2;d2=d1;j2=j1;d1=d0;j1=j0;d0=d;j0=j;}else if(d<d1){d3=d2;j3=j2;d2=d1;j2=j1;d1=d;j1=j;}else if(d<d2){d3=d2;j3=j2;d2=d;j2=j;}else if(d<d3){d3=d;j3=j;}
    }
    const ds=[d0,d1,d2,d3],js=[j0,j1,j2,j3];let total=0;for(let k=0;k<4;k++){const value=1/Math.pow(ds[k]+.0004,2.2);index[i*4+k]=js[k];weight[i*4+k]=value;total+=value;}for(let k=0;k<4;k++)weight[i*4+k]/=total;
   }
   geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(index,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weight,4));
   const skin=new THREE.SkinnedMesh(geometry,mesh.material);skin.name=mesh.name+' · teste';skin.position.copy(mesh.position);skin.quaternion.copy(mesh.quaternion);skin.scale.copy(mesh.scale);skin.frustumCulled=false;mesh.parent.add(skin);skin.updateWorldMatrix(true,false);skin.bind(skeleton,skin.matrixWorld);pairs.push({mesh,skin,visible:mesh.visible});
  }
  this.skin={skeleton,pairs};this.showSkin(true);
 }
 showSkin(on){if(this.skin)for(const {mesh,skin,visible} of this.skin.pairs){mesh.visible=on?false:visible;skin.visible=on;}}
 stop(){this.showSkin(false);this.a.root.position.copy(this.rootPosition);}
 releaseSkin(){if(!this.skin)return;this.showSkin(false);for(const {skin} of this.skin.pairs){skin.removeFromParent();skin.geometry.dispose();}this.skin.skeleton.dispose();this.skin=null;}
 dispose(){this.releaseSkin();}
}

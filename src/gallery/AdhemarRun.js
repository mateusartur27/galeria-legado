import * as THREE from 'three/webgpu';
import { TRACK } from './AdhemarRoom.js';
const CFG={run:.5,jump:.62,movementSpeed:1.40,airborneSpeed:.87,firstPush:TRACK.board-.85,exit:TRACK.lo+TRACK.period,landingX:7.75};
const smooth=x=>{x=THREE.MathUtils.clamp(x,0,1);return x*x*(3-2*x)};
// A circular filter makes the running pose and its velocity continuous at the loop boundary.
function closeRun(source){
 const d=source.duration,n=Math.ceil(d*60),times=Float32Array.from({length:n+1},(_,i)=>d*i/n);
 const tracks=source.tracks.map(track=>{
  const size=track.getValueSize(),interpolate=track.createInterpolant(),values=new Float32Array((n+1)*size),quat=track.name.endsWith('.quaternion');
  for(let i=0;i<=n;i++){
   const t=i===n?0:times[i],samples=[-2,-1,0,1,2].map(o=>Array.from(interpolate.evaluate(((t+o/120)%d+d)%d))),v=Array(size).fill(0);
   for(let j=0;j<5;j++){const sign=quat&&samples[j].reduce((sum,x,k)=>sum+x*samples[2][k],0)<0?-1:1;for(let k=0;k<size;k++)v[k]+=samples[j][k]*[1,2,4,2,1][j]*sign/10;}
   if(quat){const len=Math.hypot(...v);for(let k=0;k<size;k++)v[k]/=len;}values.set(v,i*size);
  }
  return new track.constructor(track.name,times,values);
 });return new THREE.AnimationClip(source.name,d,tracks);
}
export class AdhemarRun{
 constructor(entry,gltf,roomApi,def){
  this.entry=entry;this.roomApi=roomApi;this.root=gltf.scene;this.holder=new THREE.Group();this.holder.name='character-adhemar';this.root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(this.root),size=box.getSize(new THREE.Vector3());this.scale=(def.height??1.78)/size.y;
  this.root.position.set(0,-box.min.y,0);this.holder.add(this.root);this.holder.scale.setScalar(this.scale);this.holder.rotation.y=Math.PI/2;entry.group.add(this.holder);entry.character3d=this.holder;
  this.laneZ=()=>roomApi?.runner?.position.z??TRACK.laneZ0+TRACK.laneW/2;this.floorY=()=>roomApi?.runner?.position.y??.02;
  const clip=n=>{const c=gltf.animations.find(a=>a.name===n);if(!c)throw Error(`Adhemar: falta o clipe ${n}`);return c};
  this.clips={run:closeRun(clip('Corrida')),jump:clip('Salto'),jumpL:clip('SaltoE'), contact:clip('Aterrissar agachado')};this.mixer=new THREE.AnimationMixer(this.root);this.act={};
  for(const [name,c] of Object.entries(this.clips)){this.act[name]=this.mixer.clipAction(c).setLoop(name==='run'?THREE.LoopRepeat:THREE.LoopOnce,name==='run'?Infinity:1);this.act[name].clampWhenFinished=name!=='run';}
  this.vRun=(def.strideRig??2.946)*this.scale/(17/30)*CFG.run;this.pushDuration=this.clips.run.duration/CFG.run;
  const bones = new Map();
  this.root.traverse(node => {
   if (node.isBone) bones.set(node.name.replace(/^mixamorig:?/, ''), node);
  });
  this.leftSwing = ['LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm'].map(name => bones.get(name));
  this.previousSwing = null;
  this.forearmOpening = 0;
  this.takeoff=CFG.firstPush;this.x=TRACK.lo;this.t=0;this.state='run';this.cur=null;this.lift=0;this.hops=0;this.playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Reach the final support before the board at the right-foot stance phase.
  const d=this.clips.run.duration,start=((.86*d-(this.takeoff-this.x)/this.vRun*CFG.run)%d+d)%d;this.play('run',0,{time:start});this.place();
 }
 play(name,fade,{time=0}={}){
  const next=this.act[name],prev=this.cur;if(next===prev)return;
  next.reset().setEffectiveTimeScale(name==='run'?CFG.run:name==='contact'?.8:CFG.jump).setEffectiveWeight(1).play();next.time=time;
  if(prev)fade>0?next.crossFadeFrom(prev,fade,false):prev.stop();this.cur=next;
 }
 closestPose(names,maxTime=Infinity){
  let best={name:names[0],time:0,error:Infinity};
  for(const name of names){const clip=this.clips[name],tracks=clip.tracks.filter(t=>t.name.endsWith('.quaternion')&&!/Hand|Thumb|Index|Middle|Ring|Pinky|Toe/.test(t.name)).map(t=>({node:this.root.getObjectByName(THREE.PropertyBinding.parseTrackName(t.name).nodeName),sample:t.createInterpolant(),weight:/Leg/.test(t.name)?2:1})).filter(t=>t.node);
   for(let t=0;t<=Math.min(maxTime,clip.duration);t+=1/60){let error=0;for(const tr of tracks){const v=tr.sample.evaluate(t),q=tr.node.quaternion,dot=Math.min(1,Math.abs(q.x*v[0]+q.y*v[1]+q.z*v[2]+q.w*v[3]));error+=(1-dot)*tr.weight;}if(error<best.error)best={name,time:t,error};}
  }return best;
 }
 place(){const x0=this.roomApi?.runner?.position.x??0;this.holder.position.set(x0,this.floorY()+this.lift,this.laneZ());if(this.roomApi?.scroll)this.roomApi.scroll.value=this.x-x0;}
 openReturningForearm(dt) {
  const [shoulder, forearm, hand, rightShoulder] = this.leftSwing;
  const running = this.act.run.isRunning() ? this.act.run.getEffectiveWeight() : 0;
  if (!running || !hand || dt <= 0) {
   this.previousSwing = null;
   this.forearmOpening = 0;
   return;
  }
  const origin = shoulder.getWorldPosition(new THREE.Vector3());
  const wrist = hand.getWorldPosition(new THREE.Vector3());
  const swing = wrist.x - origin.x;
  const backwardSpeed = this.previousSwing === null ? 0 : (this.previousSwing - swing) / dt;
  this.previousSwing = swing;
  this.forearmOpening = THREE.MathUtils.damp(this.forearmOpening, smooth(backwardSpeed / .45), 30, dt);
  const outward = origin.sub(rightShoulder.getWorldPosition(new THREE.Vector3()));
  outward.x = outward.y = 0;
  outward.normalize();
  const direction = wrist.sub(forearm.getWorldPosition(new THREE.Vector3()));
  const target = direction.clone().addScaledVector(outward, .025 * running * this.forearmOpening);
  const parent = forearm.parent.getWorldQuaternion(new THREE.Quaternion());
  const rotation = new THREE.Quaternion().setFromUnitVectors(direction.normalize(), target.normalize());
  forearm.quaternion.premultiply(parent.clone().invert().multiply(rotation).multiply(parent));
 }

 enter(state){this.state=state;this.t=0;}
 beginJump(){const e=this.closestPose(['jump','jumpL'],.22);this.base=this.x;this.jumpDist=Math.max(4.35,CFG.landingX-this.x);this.jumpDur=(this.clips[e.name].duration-e.time)/CFG.jump-.29;this.jumpEntry=e;this.landingBlend=false;this.play(e.name,.22,{time:e.time});this.lift=0;this.enter('jump');}
 update(dt){
  if (!this.playing) return;
  const afterLine = this.state === 'jump' || this.state === 'contact';
  dt = Math.min(dt, .1) * CFG.movementSpeed * (afterLine ? CFG.airborneSpeed : 1);
  this.t += dt;
  let animationDt = dt;
  switch(this.state){
   case 'run':this.x+=this.vRun*dt;if(this.x>=this.takeoff){this.enter('impulse');this.impulseBase=this.x;this.hops=0;}break;
   case 'impulse': {
    const halfCycle = this.pushDuration / 2;
    const firstDuration = halfCycle * 1.48;
    const secondDuration = halfCycle * 1.24;
    const runningTime = time => halfCycle * (
     THREE.MathUtils.clamp(time / firstDuration, 0, 1) +
     THREE.MathUtils.clamp((time - firstDuration) / secondDuration, 0, 1)
    );
    animationDt = runningTime(this.t) - runningTime(this.t - dt);
    this.hops = this.t < firstDuration ? 0 : 1;
    const step = this.hops
     ? THREE.MathUtils.clamp((this.t - firstDuration) / secondDuration, 0, 1)
     : this.t / firstDuration;
    const takeoff = this.impulseBase + this.vRun * halfCycle * (1.45 + 2.08);
    const midpoint = (this.impulseBase + takeoff) / 2;
    const start = this.hops ? midpoint : this.impulseBase;
    const end = this.hops ? takeoff : midpoint;
    const duration = this.hops ? secondDuration : firstDuration;
    const entrySpeed = this.vRun * duration;
    const exitSpeed = entrySpeed * (this.hops ? CFG.airborneSpeed : 1);
    const t2 = step * step, t3 = t2 * step;
    this.x = start + (end - start) * smooth(step)
     + entrySpeed * (t3 - 2 * t2 + step) + exitSpeed * (t3 - t2);
    this.lift = (this.hops ? .43 : .22) * Math.sin(Math.PI * step) ** 2;
    if (this.t >= firstDuration + secondDuration) this.beginJump();
    break;
   }
   case 'jump': {
    const p = Math.min(this.t / this.jumpDur, 1);
    const eased = smooth(p);
    // Match the forward speed of the last stride and the landing at both ends.
    this.x = this.base + this.jumpDist * eased + this.vRun * this.jumpDur * (p - eased);
    this.lift = 0;

    // Keep the original jump's descent and blend into the two-foot contact pose.
    // Hold its first frame until touchdown, then play the knee flexion on the ground.
    const contactBlend = .26;
    const remaining = this.jumpDur - this.t;
    if (!this.landingBlend && remaining <= contactBlend) {
     this.landingBlend = true;
     this.play('contact', Math.max(0, remaining + dt));
     this.act.contact.setEffectiveTimeScale(0);
    }
    if (p === 1) this.enter('contact');
    break;
   }
   case 'contact': {
    this.act.contact.setEffectiveTimeScale(1.05);
    if (this.act.contact.time >= .21) {
     const pose = this.closestPose(['run']);
     this.play('run', .24, {time: pose.time});
     this.enter('exit');
    }
    break;
   }
   case 'exit': {
    this.x += this.vRun * dt * smooth((this.t - dt / 2) / .24);
    if (this.x >= CFG.exit) { this.x -= TRACK.period; this.enter('run'); }
    break;
   }
  }
  this.mixer.update(animationDt);
  if (this.state === 'exit') this.lift = 0;
  this.place();

  this.openReturningForearm(dt);
 }
 getStats(){return {state:this.state,t:+this.t.toFixed(2),x:+this.x.toFixed(2),speed:+this.vRun.toFixed(2),step:this.hops+1,runPhase:+(this.act.run.time/this.clips.run.duration).toFixed(3),jumpEntry:this.jumpEntry,clips:Object.fromEntries(Object.entries(this.clips).map(([k,c])=>[k,+c.duration.toFixed(2)])),scale:+this.scale.toFixed(3)};}
 jumpTo(state,x=null){this.mixer.stopAllAction();this.previousSwing=null;this.forearmOpening=0;this.cur=null;this.lift=0;this.hops=0;if(x!=null)this.x=x;this.enter(state==='hop'?'impulse':state==='up'?'exit':state);this.impulseBase=this.x;
  if(state==='jump'){this.play('run',0);this.mixer.update(0);this.beginJump();}else this.play('run',0,{time:state==='hop'||state==='impulse'?.86*this.clips.run.duration:0});this.place();}
}

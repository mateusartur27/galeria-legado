import * as THREE from 'three/webgpu';

const clean=n=>n.replace(/[^a-z0-9]/gi,'').toLowerCase();
const smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

// Keep arm influences out of the rib cage, while retaining a gradual axilla
// transition. This repairs weights, independently of the user's joint positions.
export function repairTorsoSkinWeights(root){
 if(root.userData.torsoSkinWeights)return root.userData.torsoSkinWeights;
 root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root),height=box.max.y-box.min.y,center=(box.min.x+box.max.x)/2,stats={changedVertices:0,removedArmWeight:0,meshes:0};
 root.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;const bones=mesh.skeleton.bones,names=bones.map(b=>clean(b.name)),index=n=>names.indexOf(n),left=index('leftarm'),right=index('rightarm');if(left<0||right<0)return;
  const arm=(bones[left].getWorldPosition(new THREE.Vector3()).y+bones[right].getWorldPosition(new THREE.Vector3()).y)/2,armY=(arm-box.min.y)/height;
  const half=(Math.abs(bones[left].getWorldPosition(new THREE.Vector3()).x-center)+Math.abs(bones[right].getWorldPosition(new THREE.Vector3()).x-center))/(2*height);
  const spine=['spine','spine1','spine2'].map(index).filter(i=>i>=0).map(i=>({i,y:(bones[i].getWorldPosition(new THREE.Vector3()).y-box.min.y)/height})).sort((a,b)=>a.y-b.y);if(spine.length<2||half<.01)return;
  const arms=new Set(names.map((n,i)=>/^(left|right)/.test(n)&&/arm|hand|thumb|index|middle|ring|pinky/.test(n)?i:-1).filter(i=>i>=0));
  const geometry=mesh.geometry,p=geometry.attributes.position,oldI=geometry.attributes.skinIndex,oldW=geometry.attributes.skinWeight;if(!oldI||!oldW)return;
  const indices=new Uint16Array(oldI.count*4),weights=new Float32Array(oldW.count*4),point=new THREE.Vector3(),samples=[];let changed=0;
  for(let v=0;v<p.count;v++){
   point.fromBufferAttribute(p,v).applyMatrix4(mesh.matrixWorld);const x=Math.abs((point.x-center)/height),y=(point.y-box.min.y)/height;
   const side=1-smooth(half*.98,half*1.28,x),top=1-smooth(armY-.055,armY+.01,y),core=(1-smooth(half*.55,half*.9,x))*(1-smooth(armY-.005,armY+.025,y));
   const mask=Math.max(side*top,core)*smooth(spine[0].y-.1,spine[0].y-.04,y);let affected=0;if(mask>1e-7)for(let k=0;k<4;k++)if(arms.has(oldI.getComponent(v,k)))affected+=oldW.getComponent(v,k)*mask;
   if(affected<1e-7){for(let k=0;k<4;k++){indices[v*4+k]=oldI.getComponent(v,k);weights[v*4+k]=oldW.getComponent(v,k);}if(mask>.999&&x<half*.95&&y>spine[0].y+.04&&y<armY-.06&&samples.length<120)samples.push(v);continue;}
   const influences=new Map();let removed=0;
   for(let k=0;k<4;k++){const i=oldI.getComponent(v,k),w=oldW.getComponent(v,k),amount=arms.has(i)?w*mask:0;removed+=amount;influences.set(i,(influences.get(i)??0)+w-amount);}
   if(removed>1e-7){
    let a=spine[0],b=spine[spine.length-1];for(let k=0;k<spine.length-1;k++)if(y>=spine[k].y&&y<=spine[k+1].y){a=spine[k];b=spine[k+1];break;}
    const t=THREE.MathUtils.clamp((y-a.y)/Math.max(1e-6,b.y-a.y),0,1);influences.set(a.i,(influences.get(a.i)??0)+removed*(1-t));influences.set(b.i,(influences.get(b.i)??0)+removed*t);changed++;stats.removedArmWeight+=removed;
   }
   const sorted=[...influences].filter(([,w])=>w>1e-10).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=sorted.reduce((s,[,w])=>s+w,0);
   for(let k=0;k<4;k++){indices[v*4+k]=sorted[k]?.[0]??0;weights[v*4+k]=(sorted[k]?.[1]??0)/Math.max(sum,1e-12);}
   if(mask>.999&&x<half*.95&&y>spine[0].y+.04&&y<armY-.06&&samples.length<120)samples.push(v);
  }
  if(!changed)return;
  // Share unchanged attributes; only skin indices/weights need new GPU buffers.
  const fixed=new THREE.BufferGeometry();fixed.name=geometry.name;fixed.setIndex(geometry.index);for(const [name,attr] of Object.entries(geometry.attributes))fixed.setAttribute(name,attr);
  fixed.morphAttributes=geometry.morphAttributes;fixed.morphTargetsRelative=geometry.morphTargetsRelative;fixed.groups=geometry.groups.map(g=>({...g}));fixed.boundingBox=geometry.boundingBox?.clone()??null;fixed.boundingSphere=geometry.boundingSphere?.clone()??null;
  fixed.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));fixed.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));fixed.userData={...geometry.userData,torsoSkinSamples:samples};mesh.geometry=fixed;stats.changedVertices+=changed;stats.meshes++;
 });
 root.userData.torsoSkinWeights=stats;return stats;
}

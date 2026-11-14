import * as THREE from 'three/webgpu';

// Lower the whole thumb at its base, preserving the original joint bends.
export class WritingThumbGrip {
  constructor(animation) {
    this.animation=animation;
    const bone=n=>animation.bones[n.replace(/[^a-zA-Z0-9]/g,'')];
    this.chain=[1,2,3].map(i=>bone(`DEF-thumb.0${i}.L`));
    this.restored=[];
  }
  restore() {
    for(const [bone,p,q,s] of this.restored){bone.position.copy(p);bone.quaternion.copy(q);bone.scale.copy(s);}
    this.restored.length=0;
  }
  apply() {
    const group=this.animation.entry.group;group.updateMatrixWorld(true);
    const base=this.chain[0],matrix=base.matrixWorld.clone();
    const root=base.getWorldPosition(new THREE.Vector3());
    const tip=new THREE.Vector3(0,.03192177414894104,0).applyMatrix4(this.chain[2].matrixWorld);
    const from=tip.clone().sub(root),to=from.clone().add(new THREE.Vector3(0,-.020,0));
    const turn=new THREE.Quaternion().setFromUnitVectors(from.normalize(),to.normalize());
    const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();matrix.decompose(p,q,s);
    q.premultiply(turn);
    this.restored.push([base,base.position.clone(),base.quaternion.clone(),base.scale.clone()]);
    base.parent.matrixWorld.clone().invert().multiply(new THREE.Matrix4().compose(root,q,s)).decompose(base.position,base.quaternion,base.scale);
    group.updateMatrixWorld(true);
  }
}

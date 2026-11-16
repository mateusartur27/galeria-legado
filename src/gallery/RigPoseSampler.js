import { PropertyBinding } from 'three/webgpu';

const key=name=>name.replace(/[^a-z0-9]/gi,'').toLowerCase();

// AnimationMixer caches unchanged track values. A rest-joint editor changes the
// bones externally, so constant translation/rotation tracks may otherwise remain
// at the edited pose. Always reconstruct the source pose before applying offsets.
export class RigPoseSampler {
  constructor(animation){
    this.rest=animation.restPose.map(([bone,p,q,s])=>({bone,p:p.clone(),q:q.clone(),s:s.clone()}));
    const bones=new Map(this.rest.map(({bone})=>[key(bone.name),bone]));this.tracks=[];
    for(const track of animation.clip?.tracks??[]){
      const binding=PropertyBinding.parseTrackName(track.name),bone=bones.get(key(binding.objectName==='bones'?binding.objectIndex:binding.nodeName??''));
      if(bone&&['position','quaternion','scale'].includes(binding.propertyName))this.tracks.push({bone,property:binding.propertyName,interpolant:track.createInterpolant()});
    }
  }
  sample(time){
    for(const {bone,p,q,s} of this.rest){bone.position.copy(p);bone.quaternion.copy(q);bone.scale.copy(s);}
    for(const {bone,property,interpolant} of this.tracks){bone[property].fromArray(interpolant.evaluate(time));if(property==='quaternion')bone.quaternion.normalize();}
  }
}

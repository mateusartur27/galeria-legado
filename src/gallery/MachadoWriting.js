import * as THREE from 'three/webgpu';
import { galleryBrightness } from './Gallery.js';
import { vec3 } from 'three/tsl';
import { HandReferenceEditor } from './HandReferenceEditor.js';
import { HAND_REFERENCE_PROFILES } from './MachadoHandReferences.js';
import { WritingThumbGrip } from './WritingThumbGrip.js';

const smooth = x => { x = THREE.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const windowAt = (t, a, b, c, d) => smooth((t-a)/(b-a)) * (1-smooth((t-c)/(d-c)));
const cleanName = s => s.replace(/[^a-zA-Z0-9]/g, '');
const SEATED_FORWARD = .06;

// Clip authored on the Blender rig. Room coordinates remain independent from the
// animated bounding box, so sitting and breathing cannot change the character scale.
export class MachadoWriting {
  constructor(entry, gltf) {
    this.entry = entry;
    this.root = gltf.scene;
    this.holder = new THREE.Group();
    this.holder.name = 'character-machado';
    this.holder.scale.setScalar(1.72 / (1.320552 + .935502));
    this.holder.position.set(0, .50, .36+SEATED_FORWARD);
    this.holder.add(this.root);
    entry.group.add(this.holder);
    entry.character3d = this.holder;
    this.mixer = new THREE.AnimationMixer(this.root);
    this.clip = gltf.animations.find(c => c.name === 'Escrita_Loop') ?? gltf.animations[0];
    if (!this.clip) throw new Error('O Machado está sem o clipe de escrita.');
    this.action = this.mixer.clipAction(this.clip).setLoop(THREE.LoopRepeat, Infinity).play();
    this.action.clampWhenFinished = false;
    this.time = 0;
    this.playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.bones = {};
    this.root.traverse(n => { if (n.isBone) this.bones[cleanName(n.name)] = n; });
    this.index = this.bones[cleanName('DEF-f_index.03.L')];
    this.thumb = this.bones[cleanName('DEF-thumb.03.L')];
    if (!this.index || !this.thumb) throw new Error('Não encontrei os dedos da mão de escrita.');
    this.a = new THREE.Vector3(); this.b = new THREE.Vector3(); this.grip = new THREE.Vector3();
    this.direction = new THREE.Vector3(); this.up = new THREE.Vector3(0,1,0);
    this.pen = new THREE.Group(); this.pen.name = 'Pena - mão esquerda';
    const makeMat = color => {
      const m = new THREE.MeshStandardNodeMaterial({color, roughness:.65, metalness:0});
      m.emissiveNode = vec3(new THREE.Color(color)).mul(.07).mul(galleryBrightness);
      return m;
    };
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.0022,.001,.22,8), makeMat('#d9bd82'));
    shaft.position.y=.11; this.pen.add(shaft);
    const nib = new THREE.Mesh(new THREE.ConeGeometry(.0026,.014,6), makeMat('#332b24'));
    nib.rotation.z=Math.PI; nib.position.y=.007; this.pen.add(nib);
    const feather = new THREE.Mesh(new THREE.SphereGeometry(1,12,8), makeMat('#e4ddc8'));
    feather.scale.set(.013,.069,.002);feather.position.set(.009,.213,0);feather.rotation.z=-.18;this.pen.add(feather);
    this.pen.traverse(n => { if(n.isMesh){n.castShadow=true;n.receiveShadow=true;} });
    entry.group.add(this.pen);
    entry.room.desk?.setAnimatedPen?.(true);
    entry.room.chair?.rotation.set(0,0,0);
    if(entry.room.chair){
      const chair=entry.room.chair;
      chair.userData.machadoBaseZ??=chair.position.z;
      chair.position.z=chair.userData.machadoBaseZ+SEATED_FORWARD;
    }
    this.thumbGrip=new WritingThumbGrip(this);
    this.adjustments=new HandReferenceEditor(this,{interactive:false,profiles:HAND_REFERENCE_PROFILES});
    this.update(0);
    if(new URLSearchParams(location.search).get('ajustar')==='maos'){
      this.adjustments.restore();
      this.adjustments=null;
      this.reference=new HandReferenceEditor(this,{profiles:HAND_REFERENCE_PROFILES});
    }
  }
  update(dt) {
    const adjustment=this.reference??this.adjustments;
    this.thumbGrip?.restore();
    adjustment?.restore();
    if (this.playing) this.time = (this.time + Math.min(dt, .1)) % this.clip.duration;
    this.mixer.setTime(this.time);
    this.entry.group.updateMatrixWorld(true);
    adjustment?.syncPose(this.time*18/this.clip.duration);adjustment?.applyHands();
    this.index.getWorldPosition(this.a); this.thumb.getWorldPosition(this.b);
    this.grip.copy(this.a).lerp(this.b,.5);
    this.entry.group.worldToLocal(this.grip);
    const t = this.time * 18 / this.clip.duration;
    const pause = windowAt(t,5,5.7,7.2,8)+windowAt(t,12,12.8,14.7,15.5);
    this.pen.position.set(this.grip.x+.008,.833+pause*.045+(adjustment?.penHeightShift??0),this.grip.z+.045);
    this.direction.copy(this.grip).sub(this.pen.position).normalize();
    this.pen.quaternion.setFromUnitVectors(this.up,this.direction);
    adjustment?.applyPen();this.thumbGrip?.apply();this.reference?.syncTime();
  }
  seek(seconds) { this.time=((seconds%this.clip.duration)+this.clip.duration)%this.clip.duration;this.update(0); }
  getStats() {return {clip:this.clip.name,duration:this.clip.duration,time:this.time,playing:this.playing,writingHand:'left',source:'Mixamo Writing',phase:this.time>=11.6&&this.time<15.3?'mão no queixo':this.time>=5&&this.time<8?'pausa':'escrita',bones:Object.keys(this.bones).length};}
}

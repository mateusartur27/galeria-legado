import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { AleijadinhoRigEditor } from './AleijadinhoRigEditor.js';
import { RigPoseSampler } from './RigPoseSampler.js';
import { UniversalRigTest } from './UniversalRigTest.js';
import { repairTorsoSkinWeights } from './TorsoSkinWeights.js';

const GUIDE={Hips:[0,.48,0],Spine:[0,.58,0],Spine1:[0,.68,0],Spine2:[0,.77,0],Neck:[0,.86,0],Head:[0,.91,0]};
for(const [side,s] of [['Left',1],['Right',-1]])for(const [n,p] of Object.entries({Shoulder:[.04,.80,0],Arm:[.14,.78,0],ForeArm:[.26,.77,0],Hand:[.38,.76,0],UpLeg:[.07,.48,0],Leg:[.07,.27,0],Foot:[.07,.06,0],ToeBase:[.07,.025,.06]}))GUIDE[side+n]=[p[0]*s,p[1],p[2]];
const parentOf=name=>({Spine:'Hips',Spine1:'Spine',Spine2:'Spine1',Neck:'Spine2',Head:'Neck'}[name]??(name.startsWith('Left')||name.startsWith('Right')?(()=>{const s=name.startsWith('Left')?'Left':'Right',n=name.slice(s.length);return {Shoulder:'Spine2',Arm:s+'Shoulder',ForeArm:s+'Arm',Hand:s+'ForeArm',UpLeg:'Hips',Leg:s+'UpLeg',Foot:s+'Leg',ToeBase:s+'Foot'}[n];})():null));

export class RigStudio {
  constructor(game){this.game=game;this.sessions=new Map();this.editor=null;this.token=0;}
  async init(){
    const r=await fetch('/models/rig-studio/catalog.json',{cache:'no-cache'});if(!r.ok)throw new Error('Catálogo do estúdio indisponível');this.catalog=await r.json();
    // Stable order, independent of the order in which preview models were exported.
    const order=['aleijadinho','machado','reboucas','adhemar','pele','gloria','luiz-gama','milton','nilo','pixinguinha'];this.catalog.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
    const button=document.createElement('button');button.id='rig-toggle';button.textContent='Rigs';button.title='Configurar rigs dos personagens';button.onclick=()=>this.editor?this.editor.open():this.select(this.initialId);document.querySelector('.controls').append(button);this.button=button;
    const requested=new URLSearchParams(location.search).get('rig');this.initialId=this.catalog.some(c=>c.id===requested)?requested:'aleijadinho';
    if(new URLSearchParams(location.search).has('rig'))await this.select(this.initialId);
  }
  async select(id){
    const def=this.catalog.find(c=>c.id===id);if(!def)return;const token=++this.token;
    if(this.editor){
      this.sessions.set(this.editor.id,{reference:this.editor.snapshot(),dirty:this.editor.dirty});this.editor.close();this.editor.dispose();this.disposeModel(this.editor.animation.root);this.editor=null;
    }
    const loading=document.createElement('div');loading.className='rig-studio-loading';loading.textContent='Carregando '+def.name+'…';document.body.append(loading);
    try{
      const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      const gltf=await loader.loadAsync(def.model);if(token!==this.token){this.disposeModel(gltf.scene);return;}
      const animation=this.makeAnimation(gltf,def);
      const editor=new AleijadinhoRigEditor(animation,this.game,{...def,catalog:this.catalog,onSaved:reference=>{const live=this.game.gallery.sets.entries.find(e=>e.character.id===reference.characterId)?.animation;return live?.rigCalibration?.setReference(reference);},onCharacterChange:next=>this.select(next)});this.editor=editor;
      await editor.load();
      const session=this.sessions.get(id);if(session){editor.applyReference(session.reference);editor.dirty=session.dirty;editor.status.textContent=session.dirty?'Ajustes recuperados desta sessão; ainda não salvos.':'Último rig salvo carregado.';}
      editor.open();
      history.replaceState(null,'',(()=>{const u=new URL(location.href);u.searchParams.set('rig',id);return u;})());
    }catch(error){
      console.error('Estúdio de rig:',error);const message=document.createElement('div');message.className='rig-studio-loading';message.textContent='Não foi possível carregar '+def.name+'. Use Rigs para tentar novamente.';document.body.append(message);setTimeout(()=>message.remove(),7000);
    }finally{loading.remove();}
  }
  makeAnimation(gltf,def){
    const model=gltf.scene;if(def.id==='aleijadinho')repairTorsoSkinWeights(model);model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    const root=new THREE.Group();root.name='rig-model-'+def.id;root.add(model);
    // Source skeleton transforms stay untouched below this normalization group.
    model.position.sub(new THREE.Vector3(center.x,box.min.y,center.z));root.scale.setScalar(1/size.y);
    const holder=new THREE.Group();holder.name='rig-preview-'+def.id;holder.add(root);holder.scale.setScalar(def.height);
    const home=new THREE.Group();this.game.scene.add(home);home.add(holder);home.visible=false;
    const bones={};root.traverse(n=>{if(n.isBone)bones[n.name]=n;if(n.isMesh){n.castShadow=false;n.receiveShadow=false;n.frustumCulled=false;
      const convert=src=>new THREE.MeshStandardNodeMaterial({color:src.color??'#b5a18a',map:src.map,normalMap:src.normalMap,vertexColors:src.vertexColors,roughness:.9,metalness:0,side:src.side});
      n.material=Array.isArray(n.material)?n.material.map(convert):convert(n.material);
    }});
    let referenceOnly=!Object.keys(bones).length;
    if(referenceOnly){
      const guides=new THREE.Group();holder.add(guides);
      const guide=Object.fromEntries(Object.entries(GUIDE).map(([n,p])=>[n,[...p]]));
      if(def.id==='adhemar'&&def.model.includes('adhemar-running'))for(const [side,sign] of [['Left',1],['Right',-1]])for(const [role,p] of Object.entries({Shoulder:[.04,.78,0],Arm:[.11,.76,0],ForeArm:[.15,.63,.015],Hand:[.13,.59,.10],UpLeg:[.075,.47,0],Leg:[.12,.29,.035],Foot:[.15,.065,0],ToeBase:[.15,.025,.065]}))guide[side+role]=[p[0]*sign,p[1],p[2]];
      for(const [name,p] of Object.entries(guide)){const bone=new THREE.Bone();bone.name=name;bones[name]=bone;const parent=parentOf(name);(parent?bones[parent]:guides).add(bone);bone.position.fromArray(p);if(parent)bone.position.sub(new THREE.Vector3(...guide[parent]));}
    }
    // For reference-only models include the guides in the same root interface, without scaling them twice.
    const sceneRoot=new THREE.Group();holder.remove(root);sceneRoot.add(root);
    for(const child of [...holder.children])sceneRoot.add(child);holder.add(sceneRoot);
    const restPose=[];sceneRoot.traverse(n=>{if(n.isBone)restPose.push([n,n.position.clone(),n.quaternion.clone(),n.scale.clone()]);});
    const live=this.game.gallery.sets.entries.find(e=>e.character.id===def.id)?.animation;
    const staticModel=def.id==='gloria';
    const clip=staticModel?null:(gltf.animations[0]??live?.clip??null),mixer=clip?new THREE.AnimationMixer(sceneRoot):null,action=clip?mixer.clipAction(clip).play():null;
    const animation={entry:{character:def,group:home,room:{}},root:sceneRoot,holder,scale:def.height,editorPosition:[0,0,0],bones,restPose,referenceOnly,normalization:{sourceHeight:size.y,sourceCenter:[center.x,box.min.y,center.z],sourceSpace:'GLTF +Y up',previewHeight:def.height},clip,action,mixer,time:0,playing:false,testMode:'all',
      update(dt){if(this.rigEditor?.editing&&!this.rigEditor.preview)return;if(this.rigEditor?.preview){if(this.playing)this.time=(this.time+dt)%this.universal.duration(this.testMode);this.universal.pose(this.time,this.testMode);return;}this.rigEditor?.restorePoseOffsets();if(this.clip){if(this.playing)this.time=(this.time+dt)%this.clip.duration;this.mixer.setTime(this.time);this.poseSampler.sample(this.time);}else for(const [b,p,q,s] of this.restPose){b.position.copy(p);b.quaternion.copy(q);b.scale.copy(s);}this.rigEditor?.applyCalibration();},
    };
    animation.poseSampler=new RigPoseSampler(animation);if(!staticModel)animation.universal=new UniversalRigTest(animation);
    return animation;
  }
  updateOverlay(){
    if(!this.editor)return;const now=performance.now(),dt=Math.min(.05,(now-(this.lastTime??now))/1000);this.lastTime=now;
    if(this.editor.editing&&this.editor.preview)this.editor.animation.update(dt);this.editor.updateOverlay();
  }
  get editing(){return this.editor?.editing??false;}
  disposeModel(root){
    const textures=new Set(),materials=new Set(),geometries=new Set(),skeletons=new Set();root.traverse(n=>{if(n.isSkinnedMesh)skeletons.add(n.skeleton);if(n.geometry)geometries.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material])if(m){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
    for(const s of skeletons)s.dispose();for(const t of textures)t.dispose();for(const m of materials)m.dispose();for(const g of geometries)g.dispose();root.parent?.parent?.removeFromParent();
  }
}

import * as THREE from 'three/webgpu';
import { texture, vec3 } from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { BAY_LENGTH, applyReceivedLighting, galleryBrightness } from './Gallery.js';

// One shared CC0 model and material, recycled with the architectural bays.
export class HangingPlants{
 constructor(gallery){this.gallery=gallery;this.meshes=[];this.obj=new THREE.Object3D();this.loaded=false;this.dimensions=null;}
 async load(){
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('/models/curated/hanging-vine.glb');
  const root=gltf.scene;root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const scale=2.85/size.y;
  this.dimensions={width:size.x*scale*1.1,depth:size.z*scale*.56,height:2.85};
  root.traverse(node=>{
   if(!node.isMesh)return;
   const geo=node.geometry.clone();
   for(const name of Object.keys(geo.attributes)){
    const a=geo.getAttribute(name);if(!a.normalized&&a.array instanceof Float32Array)continue;
    const out=new Float32Array(a.count*a.itemSize);
    for(let i=0;i<a.count;i++)for(let j=0;j<a.itemSize;j++)out[i*a.itemSize+j]=a.getComponent(i,j);
    geo.setAttribute(name,new THREE.BufferAttribute(out,a.itemSize));
   }
   geo.applyMatrix4(node.matrixWorld);geo.translate(-center.x,-box.max.y,-center.z);geo.scale(scale*1.1,scale,scale*.56);geo.computeBoundingBox();
   const source=node.material;
   const material=new THREE.MeshStandardNodeMaterial({map:source.map,normalMap:source.normalMap,normalScale:new THREE.Vector2(.35,.35),color:'#8da97e',roughness:.95,metalness:0,envMapIntensity:.3});
   if(source.map)material.emissiveNode=texture(source.map).rgb.mul(vec3(.12,.13,.075)).mul(galleryBrightness);
   applyReceivedLighting(material);
   const mesh=new THREE.InstancedMesh(geo,material,this.gallery.count*8);mesh.name='asset-hanging-vine';mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=true;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
   this.meshes.push(mesh);this.gallery.scene.add(mesh);
  });
  this.loaded=true;this.update(this.gallery.progress);
 }
 update(progress){
  if(!this.loaded)return;
  const g=this.gallery,phase=progress%BAY_LENGTH;let index=0;
  for(let i=0;i<g.count;i++){
   const bayZ=-(i-g.behind)*BAY_LENGTH+phase;
   for(const side of [-1,1])for(const offset of [-3.65,3.65]){
    const z=bayZ+offset-(side===1?BAY_LENGTH/2:0);
    // Very distant greenery is hidden by the gallery's fog; keep the active set bounded.
    if(Math.abs(z)>76)continue;
    const variation=offset>0?.96:1;
    // Full clusters nearby, one large silhouette in the distance; all share geometry and textures.
    const layers=Math.abs(z)<20?3:Math.abs(z)<40?2:1;
    for(let layer=0;layer<layers;layer++){
     const extra=layer>0;
     this.obj.position.set(side*(extra?3.79:3.81),6.97,z+(layer===2?-.18:extra?.16:0));
     this.obj.rotation.set(0,side*Math.PI/2+(layer===2?-side*.08:extra?side*.08:0),0);
     this.obj.scale.set(layer===2?.84:extra?.88:1,variation*(layer===2?.93:extra?.82:1),extra?.88:1);this.obj.updateMatrix();
     for(const mesh of this.meshes)mesh.setMatrixAt(index,this.obj.matrix);
     index++;
    }
   }
  }
  for(const mesh of this.meshes){mesh.count=index;mesh.instanceMatrix.needsUpdate=true;}
 }
 getStats(){return{loaded:this.loaded,instances:this.meshes[0]?.count??0,dimensions:this.dimensions,trianglesPerPlant:this.meshes[0]?(this.meshes[0].geometry.index?.count??this.meshes[0].geometry.attributes.position.count)/3:0};}
}

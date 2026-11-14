import * as THREE from 'three/webgpu';
import { texture, vec3 } from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { applyReceivedLighting, applyRoofBrightness, galleryBrightness, BAY_LENGTH } from './Gallery.js';

export class TimberRoof{
 constructor(gallery){this.gallery=gallery;this.meshes=[];this.loaded=false;this.matrix=new THREE.Matrix4();this.translation=new THREE.Matrix4();}
 async load(){
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('/models/curated/rustic-timber.glb');
  gltf.scene.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(gltf.scene),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
  gltf.scene.traverse(node=>{
   if(!node.isMesh)return;const geo=node.geometry.clone();
   for(const name of Object.keys(geo.attributes)){const a=geo.getAttribute(name);if(!a.normalized&&a.array instanceof Float32Array)continue;const out=new Float32Array(a.count*a.itemSize);for(let i=0;i<a.count;i++)for(let j=0;j<a.itemSize;j++)out[i*a.itemSize+j]=a.getComponent(i,j);geo.setAttribute(name,new THREE.BufferAttribute(out,a.itemSize));}
   geo.applyMatrix4(node.matrixWorld);geo.translate(-center.x,-center.y,-center.z);geo.scale(1/size.x,1/size.y,1/size.z);
   const src=node.material,mat=new THREE.MeshPhysicalNodeMaterial({color:'#ad9278',map:src.map,normalMap:src.normalMap,normalScale:new THREE.Vector2(.4,.4),roughnessMap:null,roughness:1,metalness:0,specularIntensity:.08,clearcoat:0,envMapIntensity:.12});
   mat.emissiveNode=texture(src.map).rgb.mul(vec3(.22,.185,.14)).mul(galleryBrightness);applyReceivedLighting(mat);applyRoofBrightness(mat);
   const mesh=new THREE.InstancedMesh(geo,mat,this.gallery.count*this.gallery.timberLayout.length);mesh.name='asset-rustic-timber';mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.gallery.scene.add(mesh);this.meshes.push(mesh);
  });
  this.loaded=true;this.update(this.gallery.progress);
  for(const mesh of this.gallery.meshes)if(mesh.name.startsWith('gallery-roof-placeholder'))mesh.visible=false;
 }
 update(progress){
  if(!this.loaded)return;const g=this.gallery,phase=progress%BAY_LENGTH;
  for(let i=0;i<g.count;i++){
   this.translation.makeTranslation(0,0,-(i-g.behind)*BAY_LENGTH+phase);
   for(let j=0;j<g.timberLayout.length;j++){
    this.matrix.multiplyMatrices(this.translation,g.timberLayout[j]);
    for(const mesh of this.meshes)mesh.setMatrixAt(i*g.timberLayout.length+j,this.matrix);
   }
  }
  for(const mesh of this.meshes)mesh.instanceMatrix.needsUpdate=true;
 }
 getStats(){return{loaded:this.loaded,beamsPerBay:this.gallery.timberLayout.length,instances:this.gallery.count*this.gallery.timberLayout.length,trianglesPerBeam:this.meshes[0]?(this.meshes[0].geometry.index?.count??this.meshes[0].geometry.attributes.position.count)/3:0};}
}


import * as THREE from 'three/webgpu';
import { texture, vec3 } from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { BAY_LENGTH, applyReceivedLighting, galleryBrightness } from './Gallery.js';

const CHANDELIER='Chandelier_02';
export class CuratedAssets{
 constructor(gallery){this.gallery=gallery;this.groups=[];this.loaded=[];this.dimensions={};this.obj=new THREE.Object3D();this.materialCache=new Map();}
 async load(){
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  // Small, local payloads are fetched progressively; each file is decoded only once.
  const gltf=await loader.loadAsync(`/models/curated/${CHANDELIER}.glb`);
  this.install(CHANDELIER,gltf.scene);this.loaded.push(CHANDELIER);this.update(this.gallery.progress);
 }
 material(source){
  if(/bulb/i.test(source.name))return this.gallery.materials.chandelier;
  if(this.materialCache.has(source))return this.materialCache.get(source);
  const mat=new THREE.MeshStandardNodeMaterial({color:source.color,map:source.map,normalMap:source.normalMap,normalScale:new THREE.Vector2(.35,.35),roughnessMap:source.roughnessMap,metalnessMap:source.metalnessMap,aoMap:source.aoMap,roughness:Math.max(.5,source.roughness),metalness:source.metalness,side:source.side});
  if(mat.map)mat.emissiveNode=texture(mat.map).rgb.mul(vec3(.13,.1,.065)).mul(galleryBrightness);
  applyReceivedLighting(mat);this.materialCache.set(source,mat);return mat;
 }
 install(id,root){
  root.updateMatrixWorld(true);const bbox=new THREE.Box3().setFromObject(root),size=bbox.getSize(new THREE.Vector3()),center=bbox.getCenter(new THREE.Vector3());
  const scale=Math.min(2.05/Math.max(size.x,size.z),1.85/size.y);
  this.dimensions[id]={width:size.x*scale,depth:size.z*scale,height:size.y*scale,scale};
  const pieces=[];
  root.traverse(node=>{
   if(!node.isMesh)return;
   const geo=node.geometry.clone();
   for(const name of Object.keys(geo.attributes)){
    const a=geo.getAttribute(name);if(!a.normalized&&a.array instanceof Float32Array)continue;
    const f=new Float32Array(a.count*a.itemSize);for(let i=0;i<a.count;i++)for(let j=0;j<a.itemSize;j++)f[i*a.itemSize+j]=a.getComponent(i,j);geo.setAttribute(name,new THREE.BufferAttribute(f,a.itemSize));
   }
   geo.applyMatrix4(node.matrixWorld);geo.translate(-center.x,-bbox.max.y,-center.z);geo.scale(scale,scale,scale);geo.computeBoundingBox();
   const mesh=new THREE.InstancedMesh(geo,this.material(node.material),this.gallery.count);mesh.name=`asset-${id}`;mesh.frustumCulled=false;mesh.receiveShadow=true;mesh.castShadow=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.gallery.scene.add(mesh);pieces.push(mesh);
  });
  this.groups.push({id,pieces});
 }
 update(progress){
  const g=this.gallery,phase=progress%BAY_LENGTH;
  for(const group of this.groups){let index=0;
   for(let i=0;i<g.count;i++){
    const z=-(i-g.behind)*BAY_LENGTH+phase;
    this.place(group,index++,0,5.7,z,0);
   }
   for(const mesh of group.pieces){mesh.count=index;mesh.instanceMatrix.needsUpdate=true;}
  }
 }
 place(group,index,x,y,z,yaw){this.obj.position.set(x,y,z);this.obj.rotation.set(0,yaw,0);this.obj.scale.setScalar(1);this.obj.updateMatrix();for(const m of group.pieces)m.setMatrixAt(index,this.obj.matrix);}
 getStats(){return{loaded:[...this.loaded],dimensions:this.dimensions,instances:this.groups.map(g=>({id:g.id,count:g.pieces[0]?.count??0}))};}
}


import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),lib='D:/threejs-lab/tools/node_modules/';
const {NodeIO}=require(lib+'@gltf-transform/core');const {prune}=require(lib+'@gltf-transform/functions');
const io=new NodeIO(),root='D:/ProjectGames/galeria-legado';
const doc=await io.read(root+'/asset-source/timber/models/modular_wooden_pier/modular_wooden_pier_1k.gltf');
const candidates=[];
for(const mesh of doc.getRoot().listMeshes())for(const prim of mesh.listPrimitives()){
 if(!/poles/.test(prim.getMaterial()?.getName()))continue;
 const positions=prim.getAttribute('POSITION').getArray(),n=positions.length/3,indices=prim.getIndices()?.getArray()??Uint32Array.from({length:n},(_,i)=>i),parent=Int32Array.from({length:n},(_,i)=>i),seen=new Map();
 const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};const join=(a,b)=>{parent[find(a)]=find(b);};
 for(let i=0;i<n;i++){const key=[0,1,2].map(a=>Math.round(positions[i*3+a]*100000)).join(',');if(seen.has(key))join(i,seen.get(key));else seen.set(key,i);}
 for(let i=0;i<indices.length;i+=3){join(indices[i],indices[i+1]);join(indices[i],indices[i+2]);}
 const comps=new Map();for(let i=0;i<indices.length;i+=3){const k=find(indices[i]);if(!comps.has(k))comps.set(k,[]);comps.get(k).push(indices[i],indices[i+1],indices[i+2]);}
 for(const ids of comps.values()){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const i of ids)for(let a=0;a<3;a++){min[a]=Math.min(min[a],positions[i*3+a]);max[a]=Math.max(max[a],positions[i*3+a]);}
  const size=min.map((v,a)=>max[a]-v),long=size.indexOf(Math.max(...size)),cross=size.filter((_,a)=>a!==long);
  if(size[long]>2&&Math.min(...cross)>.1&&Math.max(...cross)<.65)candidates.push({mesh:mesh.getName(),prim,ids,min,max,size,long,ratio:size[long]/Math.max(...cross)});
 }
}
candidates.sort((a,b)=>b.ratio-a.ratio);console.log(candidates.slice(0,10).map(({mesh,size,ratio,ids,long})=>({mesh,size,ratio,triangles:ids.length/3,long})));
const pick=candidates[0];if(!pick)throw new Error('Nenhuma viga adequada no kit');
const buffer=doc.getRoot().listBuffers()[0],p=doc.createPrimitive().setMaterial(pick.prim.getMaterial()),unique=[...new Set(pick.ids)],remap=new Map(unique.map((v,i)=>[v,i]));
for(const semantic of pick.prim.listSemantics()){
 const src=pick.prim.getAttribute(semantic),stride=src.getElementSize(),arr=src.getArray(),out=new Float32Array(unique.length*stride);
 for(let i=0;i<unique.length;i++)for(let a=0;a<stride;a++)out[i*stride+a]=arr[unique[i]*stride+a];
 p.setAttribute(semantic,doc.createAccessor().setType(src.getType()).setArray(out).setBuffer(buffer));
}
p.setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from(pick.ids,i=>remap.get(i))).setBuffer(buffer));
const model=doc.createMesh('Rustic timber / Poly Haven').addPrimitive(p),node=doc.createNode('Timber').setMesh(model);
for(const scene of doc.getRoot().listScenes())for(const child of scene.listChildren())scene.removeChild(child);
doc.getRoot().listScenes()[0].addChild(node);await doc.transform(prune());await io.write(root+'/asset-source/timber/beam-extracted.glb',doc);
console.log('Peça selecionada:',pick.mesh,pick.size,'triângulos',pick.ids.length/3);

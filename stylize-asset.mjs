import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const root='D:/threejs-lab/tools/node_modules/';
const {NodeIO}=require(root+'@gltf-transform/core');
const {ALL_EXTENSIONS}=require(root+'@gltf-transform/extensions');
const {prune,meshopt}=require(root+'@gltf-transform/functions');
const {MeshoptDecoder,MeshoptEncoder}=require(root+'meshoptimizer');
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const doc=await io.read('D:/ProjectGames/galeria-legado/versions/day-v1/public/models/gallery-plant.glb');
for(const mesh of doc.getRoot().listMeshes())for(const primitive of mesh.listPrimitives()){
 const name=primitive.getMaterial()?.getName()??'';
 primitive.setMaterial(doc.createMaterial(name).setBaseColorFactor(/lea/i.test(name)?[.3,.5,.35,1]:[.1,.3,.35,1]).setRoughnessFactor(.65).setDoubleSided(true));
}
await doc.transform(prune(),meshopt({encoder:MeshoptEncoder,level:'medium'}));
await io.write('D:/ProjectGames/galeria-legado/public/models/gallery-plant-stylized.glb',doc);
console.log('Planta estilizada exportada sem os mapas fotográficos.');


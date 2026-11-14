import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const sharp=createRequire(import.meta.url)('D:/threejs-lab/tools/node_modules/sharp');
const root='D:/ProjectGames/galeria-legado';
await fs.mkdir(path.join(root,'public/textures'),{recursive:true});
for(const [id,name] of [['terracotta_floor_tiles','terracotta'],['dark_wood','walnut'],['white_plaster_02','plaster']]){
 for(const type of ['diff','nor_gl','arm']){
  await sharp(path.join(root,'asset-source/textures',id,`${id}_${type}_1k.jpg`)).resize(type==='diff'?1024:512).webp({quality:type==='nor_gl'?90:84}).toFile(path.join(root,'public/textures',`${name}-${type}.webp`));
 }
}
await fs.mkdir(path.join(root,'public/basis'),{recursive:true});
for(const name of ['basis_transcoder.js','basis_transcoder.wasm'])await fs.copyFile(path.join(root,'node_modules/three/examples/jsm/libs/basis',name),path.join(root,'public/basis',name));
console.log('Texturas WebP e decodificador KTX2 local prontos.');

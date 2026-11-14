import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';

const NAMES=new Set(['Hips','Spine','Spine1','Spine2','Neck','Head',...['Left','Right'].flatMap(s=>['Shoulder','Arm','ForeArm','Hand','UpLeg','Leg','Foot','ToeBase'].map(n=>s+n))]);
export function rigReferenceStorage(root){
  const directory=path.resolve(root,'asset-source/aleijadinho/rig-references');
  return {name:'aleijadinho-rig-reference',configureServer(server){
    server.middlewares.use('/__reference/aleijadinho-rig',async(req,res)=>{
      const reply=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
      if(req.method==='GET'){try{reply(200,JSON.parse(await readFile(path.join(directory,'latest.json'),'utf8')));}catch{reply(200,null);}return;}
      if(req.method!=='POST'){reply(405,{error:'Use GET ou POST.'});return;}
      try{const origin=new URL(req.headers.origin??'');if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||origin.host!==req.headers.host)throw 0;}catch{reply(403,{error:'Apenas a cena local pode salvar o rig.'});return;}
      let body='',bytes=0,oversize=false;
      req.on('data',chunk=>{bytes+=chunk.length;if(bytes>128*1024){oversize=true;return;}body+=chunk;});
      req.on('end',async()=>{
        if(oversize){reply(413,{error:'Referência muito grande.'});return;}
        try{
          const data=JSON.parse(body),vec=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<10);
          if(data.schema!=='aleijadinho-rig/v1'||data.mode!=='rest-joint-calibration'||!Number.isFinite(Date.parse(data.createdAt))||!Array.isArray(data.bones)||data.bones.length!==22||new Set(data.bones.map(b=>b.name)).size!==22)throw new Error('Referência de rig inválida.');
          for(const b of data.bones)if(!NAMES.has(b.name)||!vec(b.position,3)||!vec(b.quaternion,4)||!vec(b.scale,3)||!vec(b.modelHead,3))throw new Error('Articulação inválida.');
          await mkdir(directory,{recursive:true});const filename='rig-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
          const json=JSON.stringify({...data,savedBy:'aleijadinho-rig-editor'},null,2);
          await writeFile(path.join(directory,filename),json,'utf8');await writeFile(path.join(directory,'latest.json'),json,'utf8');
          reply(200,{saved:true,file:'asset-source/aleijadinho/rig-references/'+filename});
        }catch(error){reply(400,{error:error.message});}
      });
    });
  }};
}

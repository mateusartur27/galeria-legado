import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';

const IDS=new Set(['aleijadinho','machado','reboucas','adhemar','pele','gloria','luiz-gama','milton','nilo','pixinguinha']);
export function rigReferenceStorage(root){
  return {name:'character-rig-references',configureServer(server){
    server.middlewares.use('/__reference',async(req,res,next)=>{
      const match=req.url?.split('?')[0].match(/^\/([a-z-]+)-rig\/?$/),id=match?.[1];if(!IDS.has(id)){next();return;}
      const directory=path.resolve(root,'asset-source',id,'rig-references');
      const reply=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
      if(req.method==='GET'){try{reply(200,JSON.parse(await readFile(path.join(directory,'latest.json'),'utf8')));}catch{reply(200,null);}return;}
      if(req.method!=='POST'){reply(405,{error:'Use GET ou POST.'});return;}
      try{const origin=new URL(req.headers.origin??'');if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||origin.host!==req.headers.host)throw 0;}catch{reply(403,{error:'Apenas a cena local pode salvar o rig.'});return;}
      let body='',bytes=0,oversize=false;
      req.on('data',chunk=>{bytes+=chunk.length;if(bytes>1024*1024){oversize=true;return;}body+=chunk;});
      req.on('end',async()=>{
        if(oversize){reply(413,{error:'Referência muito grande.'});return;}
        try{
          const data=JSON.parse(body),vec=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<100);
          const legacy=id==='aleijadinho'&&data.schema==='aleijadinho-rig/v1';
          if(!(legacy||data.schema==='character-rig/v2'&&data.characterId===id)||!['rest-joint-calibration','joint-layout'].includes(data.mode)||!Number.isFinite(Date.parse(data.createdAt))||!Array.isArray(data.bones)||data.bones.length<1||data.bones.length>512||new Set(data.bones.map(b=>b.name)).size!==data.bones.length)throw new Error('Referência de rig inválida.');
          for(const b of data.bones)if(typeof b.name!=='string'||!/^[\w .:-]{1,120}$/.test(b.name)||!vec(b.position,3)||!vec(b.quaternion,4)||!vec(b.scale,3)||!vec(b.modelHead,3))throw new Error('Articulação inválida.');
          await mkdir(directory,{recursive:true});const filename='rig-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
          const json=JSON.stringify({...data,savedBy:'character-rig-editor'},null,2);
          await writeFile(path.join(directory,filename),json,'utf8');await writeFile(path.join(directory,'latest.json'),json,'utf8');
          if(id==='aleijadinho'&&data.mode==='rest-joint-calibration'){const published=path.resolve(root,'public/rigs');await mkdir(published,{recursive:true});await writeFile(path.join(published,id+'.json'),json,'utf8');}
          reply(200,{saved:true,file:'asset-source/'+id+'/rig-references/'+filename});
        }catch(error){reply(400,{error:error.message});}
      });
    });
  }};
}

import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';

// Guarda a linha do tempo do golpe do Aleijadinho (editor "Golpe") em asset-source/aleijadinho/golpe-references/latest.json
export function golpeReferenceStorage(root){
  const directory=path.resolve(root,'asset-source/aleijadinho/golpe-references');
  return {name:'aleijadinho-golpe-reference',configureServer(server){
    server.middlewares.use('/__reference/aleijadinho-golpe',async(req,res)=>{
      const reply=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
      if(req.method==='GET'){try{reply(200,JSON.parse(await readFile(path.join(directory,'latest.json'),'utf8')));}catch{reply(200,null);}return;}
      if(req.method!=='POST'){reply(405,{error:'Use GET ou POST.'});return;}
      try{const origin=new URL(req.headers.origin??'');if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||origin.host!==req.headers.host)throw 0;}catch{reply(403,{error:'Apenas a cena local pode salvar.'});return;}
      let body='',bytes=0,oversize=false;
      req.on('data',chunk=>{bytes+=chunk.length;if(bytes>64*1024){oversize=true;return;}body+=chunk;});
      req.on('end',async()=>{
        if(oversize){reply(413,{error:'Arquivo muito grande.'});return;}
        try{
          const d=JSON.parse(body),num=v=>Number.isFinite(v)&&Math.abs(v)<1000;
          if(d.schema!=='aleijadinho-golpe/v1'||!Number.isFinite(Date.parse(d.createdAt))||!Array.isArray(d.keys)||d.keys.length<1||d.keys.length>64||!num(d.tool?.pitch)||!num(d.tool?.yaw))throw new Error('Linha do tempo inválida.');
          for(const k of d.keys)if(!['t','recuo','ang','giro','tronco'].every(f=>num(k[f])))throw new Error('Chave inválida.');
          await mkdir(directory,{recursive:true});const filename='golpe-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
          const json=JSON.stringify({...d,savedBy:'aleijadinho-golpe-editor'},null,2);
          await writeFile(path.join(directory,filename),json,'utf8');await writeFile(path.join(directory,'latest.json'),json,'utf8');
          reply(200,{saved:true,file:'asset-source/aleijadinho/golpe-references/'+filename});
        }catch(error){reply(400,{error:error.message});}
      });
    });
  }};
}

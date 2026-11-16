import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {validToolAttachments} from '../src/gallery/ToolAttachmentSchema.js';

export function toolAttachmentStorage(root){
 const directory=path.resolve(root,'asset-source/aleijadinho/tool-attachments'),published=path.resolve(root,'public/attachments/aleijadinho.json');
 return {name:'aleijadinho-tool-attachments',configureServer(server){
  server.middlewares.use('/__reference/aleijadinho-tools',async(req,res)=>{
   const reply=(status,value)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(value));};
   if(req.method==='GET'){try{reply(200,JSON.parse(await readFile(path.join(directory,'latest.json'),'utf8')));}catch{reply(200,null);}return;}
   if(req.method!=='POST'){reply(405,{error:'Use GET ou POST.'});return;}
   try{const origin=new URL(req.headers.origin??'');if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||origin.host!==req.headers.host)throw 0;}catch{reply(403,{error:'Apenas a cena local pode salvar os itens.'});return;}
   let body='',size=0,tooLarge=false;req.on('data',chunk=>{size+=chunk.length;if(size>32768){tooLarge=true;return;}body+=chunk;});
   req.on('end',async()=>{
    if(tooLarge){reply(413,{error:'Arquivo muito grande.'});return;}
    try{
     const data=JSON.parse(body);if(!validToolAttachments(data))throw new Error('Ajustes dos itens inválidos.');
     const json=JSON.stringify({...data,savedBy:'tool-attachment-editor'},null,2),filename='itens-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
     await mkdir(directory,{recursive:true});await mkdir(path.dirname(published),{recursive:true});
     await writeFile(path.join(directory,filename),json);await writeFile(path.join(directory,'latest.json'),json);await writeFile(published,json);
     reply(200,{saved:true,file:'asset-source/aleijadinho/tool-attachments/'+filename});
    }catch(error){reply(400,{error:error.message});}
   });
  });
 }};
}

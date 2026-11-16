import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';

// Guarda as posições salvas no painel "Cenário · posições" do Aleijadinho em asset-source/aleijadinho/layout/latest.json
// (assim o que o usuário salva no navegador também fica no projeto e vira padrão).
export function layoutReferenceStorage(root){
  const directory=path.resolve(root,'asset-source/aleijadinho/layout');
  return {name:'aleijadinho-layout-reference',configureServer(server){
    server.middlewares.use('/__reference/aleijadinho-layout',async(req,res)=>{
      const reply=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
      if(req.method==='GET'){try{reply(200,JSON.parse(await readFile(path.join(directory,'latest.json'),'utf8')));}catch{reply(200,null);}return;}
      if(req.method!=='POST'){reply(405,{error:'Use GET ou POST.'});return;}
      try{const origin=new URL(req.headers.origin??'');if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||origin.host!==req.headers.host)throw 0;}catch{reply(403,{error:'Apenas a cena local pode salvar.'});return;}
      let body='',bytes=0,oversize=false;
      req.on('data',chunk=>{bytes+=chunk.length;if(bytes>64*1024){oversize=true;return;}body+=chunk;});
      req.on('end',async()=>{
        if(oversize){reply(413,{error:'Arquivo muito grande.'});return;}
        try{
          const layout=JSON.parse(body);
          if(!layout||typeof layout!=='object'||!layout.aleijadinho)throw new Error('Layout inválido.');
          for(const [k,v] of Object.entries(layout))if(!v||typeof v!=='object'||Object.values(v).some(n=>!Number.isFinite(n)))throw new Error('Valor inválido em '+k);
          await mkdir(directory,{recursive:true});
          const json=JSON.stringify({savedAt:new Date().toISOString(),layout},null,2);
          await writeFile(path.join(directory,'latest.json'),json,'utf8');
          await writeFile(path.join(directory,'layout-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'),json,'utf8');
          reply(200,{saved:true});
        }catch(error){reply(400,{error:error.message});}
      });
    });
  }};
}

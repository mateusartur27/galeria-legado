import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

// Local development only. Writes reference JSON to one fixed project directory.
export function handReferenceStorage(projectRoot) {
  return {name:'machado-hand-reference',configureServer(server){
    server.middlewares.use('/__reference/machado-hands',(req,res)=>{
      const reply=(code,value)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
      if(req.method!=='POST'){reply(405,{error:'Use POST'});return;}
      try {
        const origin=new URL(req.headers.origin??'');
        if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)||origin.host!==req.headers.host){reply(403,{error:'Apenas a cena local pode salvar referências.'});return;}
      } catch {reply(403,{error:'Origem local obrigatória.'});return;}
      let body='',bytes=0,tooLarge=false;
      req.on('data',chunk=>{bytes+=chunk.length;if(bytes>512*1024){tooLarge=true;return;}body+=chunk;});
      req.on('end',async()=>{
        if(tooLarge){reply(413,{error:'Referência muito grande.'});return;}
        try {
          const data=JSON.parse(body);
          if(data.schema!=='machado-hand-reference/v1'||!Number.isFinite(data.sampleTime)||!Array.isArray(data.bonePoses)||data.bonePoses.length!==61)throw new Error('Referência inválida.');
          for(const pose of data.bonePoses)if(!Array.isArray(pose.setMatrix)||pose.setMatrix.length!==16||!pose.setMatrix.every(Number.isFinite))throw new Error('Matriz inválida.');
          const directory=path.resolve(projectRoot,'asset-source/machado/references');await mkdir(directory,{recursive:true});
          const filename='maos-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
          const json=JSON.stringify({...data,savedBy:'hand-reference-editor'},null,2);
          await writeFile(path.join(directory,filename),json,'utf8');
          await writeFile(path.join(directory,'latest.json'),json,'utf8');
          reply(200,{saved:true,file:'asset-source/machado/references/'+filename});
        } catch(error){reply(400,{error:error.message});}
      });
    });
  }};
}

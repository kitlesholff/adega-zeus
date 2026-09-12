import fs from 'node:fs/promises';
const report=JSON.parse(await fs.readFile(new URL('./import-review.json',import.meta.url),'utf8'));
const target=new URL('../../front-end/assets/catalogo/',import.meta.url);
await fs.mkdir(target,{recursive:true});
const todo=report.provenance.filter(p=>p.imageUrl),results=JSON.parse(await fs.readFile(new URL('./image-local-map.json',import.meta.url),'utf8').catch(()=>'{}')),failed=[];let next=0;
await Promise.all(Array.from({length:6},async()=>{while(next<todo.length){const p=todo[next++];try{
 if(results[p.id]){const existing=new URL('../../front-end/'+results[p.id],import.meta.url);if((await fs.stat(existing).catch(()=>null))?.size>100)continue;delete results[p.id];}
 const response=await fetch(p.imageUrl,{signal:AbortSignal.timeout(20000)});
 const type=response.headers.get('content-type')||'';
 if(!response.ok||!type.startsWith('image/'))throw Error(`HTTP ${response.status} ${type}`);
 const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length<100)throw Error('Imagem vazia');
 const ext=type.includes('png')?'png':type.includes('webp')?'webp':type.includes('avif')?'avif':'jpg';
 const name=p.id+'.'+ext;await fs.writeFile(new URL(name,target),bytes);results[p.id]='assets/catalogo/'+name;
 }catch(e){failed.push({id:p.id,url:p.imageUrl,error:e.message});}}}));
await fs.writeFile(new URL('./image-local-map.json',import.meta.url),JSON.stringify(results,null,2));
await fs.writeFile(new URL('./image-download-failures.json',import.meta.url),JSON.stringify(failed,null,2));
console.log(JSON.stringify({downloaded:Object.keys(results).length,failed},null,2));

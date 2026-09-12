import fs from 'node:fs/promises';
const rows=JSON.parse(await fs.readFile(new URL('./import-source.json',import.meta.url),'utf8'));
const candidates=JSON.parse(await fs.readFile(new URL('./image-candidates.json',import.meta.url),'utf8'));
const normal=s=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/(\d)\s+(ml|g|l)\b/g,'$1$2').replace(/balenna/g,'ballena').replace(/ballantaimes/g,'ballantines').replace(/oldparr/g,'old parr').replace(/strambery/g,'strawberry').replace(/sena[cç]oes/g,'sensacoes').replace(/frutella/g,'fruitella').replace(/morrango/g,'morango').replace(/redady/g,'ready');
const stop=new Set('cerveja lata long neck ml grande salgado salgadinho bebida energetico tradicional 2l de com sem e sabor zero frutas para pacote'.split(' '));
const tokens=s=>normal(s).match(/[a-z0-9]+/g)?.filter(x=>!stop.has(x))||[];
const excluded=p=>/ESSENCIA/.test(p.category)||(/CIGARROS/.test(p.category)&&!/Isqueiro/i.test(p.name))||(/PALHEIROS/.test(p.category)&&!/^papel/i.test(p.name))||p.name==='blunt';
const matches=[];
for(const p of rows.filter(p=>!p.image&&!excluded(p)&&!/COMBOS|COPÃO|HEAD SHOP|TABACARIA/.test(p.category))){
 const words=tokens(p.name),n=normal(p.name);
 const rank=candidates.map(c=>{const text=normal(c.name),w=new Set(tokens(c.name));let score=words.filter(t=>w.has(t)).length/words.length;
 if(n.includes('zero')!==text.includes('zero'))score-=.45;
 const size=n.match(/\d+(?:[.,]\d+)?(?:ml|g|l)\b/);if(size&&!text.includes(size[0]))score-=.4;
 return {...c,score};}).sort((a,b)=>b.score-a.score);
 matches.push({id:p.id,name:p.name,candidates:rank.slice(0,2)});
}
await fs.writeFile(new URL('./image-matches.json',import.meta.url),JSON.stringify(matches,null,2));
console.log(matches.map(p=>p.id+' '+p.name+' => '+p.candidates.map(c=>c.score.toFixed(2)+' '+c.name).join(' | ')).join('\n'));

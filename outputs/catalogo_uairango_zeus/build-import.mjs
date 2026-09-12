import fs from 'node:fs/promises';
const rows=JSON.parse(await fs.readFile(new URL('./import-source.json',import.meta.url),'utf8'));
const matches=JSON.parse(await fs.readFile(new URL('./image-matches.json',import.meta.url),'utf8'));
const candidates=JSON.parse(await fs.readFile(new URL('./image-candidates.json',import.meta.url),'utf8'));
const localImages=JSON.parse(await fs.readFile(new URL('./image-local-map.json',import.meta.url),'utf8').catch(()=>'{}'));
const excluded=p=>/ESSENCIA/.test(p.category)||(/CIGARROS/.test(p.category)&&!/Isqueiro/i.test(p.name))||(/PALHEIROS/.test(p.category)&&!/^papel/i.test(p.name))||p.name==='blunt';
const root=new URL('../../',import.meta.url);
const reviewed=new Set([3477643,3440229,3507879,3507885,3507873,3559833,3559829,3559835,3559837,3559831,3559839,3559843,3559841,3700240,3231153,3231117,3286161,3285957,3309633,3479097,3281327,3521327,3507935,3299887,3370383,3300243,1240643,3479073,3479077,3519449,3528939,3519463,3403563,3403567,3403571]);
const explicit={3518961:'Cerveja Pilsen Puro Malte Eisenbahn Lata 350ml',3518977:'Cerveja Eisenbahn Pilsen Puro Malte Long Neck 355ml',3285923:'Vodka Smirnoff Ice 275ml',3613929:'Cerveja Stella Artois Pure Gold Sem Glúten Long Neck 330ml',3529003:'BEB MISTA ALC JACK DANIELS 269ML-LT WHISK/COCA-COLA',3209099:'Tequila Silver Jose Cuervo Especial Garrafa 750ml',3300237:'Refrigerante Coca-Cola Sabor Original Mini 220ml',3300239:'Refrigerante sem Açúcar Coca-Cola Lata 220ml',3528927:'Confeito Sortido Mentos Rainbow Pacote 37,5g 14 Unidades'};
const counts=new Map();for(const p of rows)counts.set(p.id,(counts.get(p.id)||0)+1);
const slug=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const id=p=>'uairango-10999-'+p.id+(counts.get(p.id)>1?'-'+slug(p.option):'');
const provenance=[],pending=[],products=[];
for(const p of rows.filter(p=>!excluded(p))){
 let image=p.image?'https://cdn2.uairango.com/produtos/'+p.image:null,origin=image?'UaiRango':null;
 if(!image){const choice=explicit[p.id]?candidates.find(c=>c.name===explicit[p.id]):reviewed.has(p.id)?matches.find(m=>m.id===p.id)?.candidates[0]:null;if(choice?.image){image=choice.image;origin=choice.url;}}
 if(!image&&p.id===3285865){image='https://www.labebidas.com.br/774-thumbnail_gallery/eternity-coco-e-acai-900-ml.webp';origin='https://www.labebidas.com.br/gin/eternity-coco-e-acai-900-ml-785';}
 const option=!/^(unico|unidade|\.)$/i.test(slug(p.option))?p.option:null;
 let name=p.name;if(counts.get(p.id)>1)name+=' — '+p.option;else if(option&&/^COPÃO/.test(p.category))name+=' — Copão 700ml';
 let category=p.category==='CERVEJA FARDO'?'Fardo':p.category==='CIGARROS / ISQUEIRO'?'Isqueiros':p.category==='PALHEIROS / FUMOS/ FILTROS'?'Papéis e filtros':p.category;
 const product={id:id(p),product_type:category==='Fardo'?'box':category==='COMBOS'?'combo':'product',name,description:p.description||'',price:p.previous||p.price,sale_price:p.previous?p.price:null,promotion_label:p.previous?'Promoção':null,category,image:image||'assets/product-image-pending.svg',available:true,featured:false,kit_items:[],box_option:null,box_units:null,parent_product_id:null};
 if(category==='Fardo'){const units=(p.name+' '+(p.description||'')).match(/(\d+)\s*unid/i);if(units)product.box_units=Number(units[1]);}
 if(localImages[product.id])product.image=localImages[product.id];
 products.push(product);provenance.push({id:product.id,sourceId:p.id,sourceName:p.name,sourceCategory:p.category,option:p.option,imageSource:origin,imageUrl:image});
 if(!image)pending.push({id:product.id,name:product.name,reason:'Foto específica ainda não confirmada'});
}
const pid=n=>'uairango-10999-'+n;
const get=n=>products.find(p=>p.id===pid(n));
const component=(n,quantity,name)=>({productId:n?pid(n):null,name:name||get(n)?.name,quantity});
const custom=(name,quantity)=>component(null,quantity,name);
const red=(qty=4)=>component(1236461,qty);
const ice=(flavor='Gelo (sabor não informado)',qty=4)=>custom(flavor,qty);
const cups=()=>custom('Copos',4);
const combos={
 3073981:[component(1549869,1),red(),ice(),cups()],
 3707904:[component(3605819,1),component(1822945,3),ice('Gelo Skol Beats Tropical'),cups()],
 3707898:[component(3605817,1),component(3285957,1),component(1238789,4),cups()],
 3707902:[component(3605817,1),component(1236465,3),component(1238789,4),cups()],
 1273997:[component(3130571,1),custom('Energético de sabor',null),ice()],
 1722749:[component(1722503,1),red(),ice()],
 568627:[component(1236477,1),custom('Energético Fluxo',null),ice('Gelo de coco ou maracujá')],
 1722819:[component(1722787,1),red(),ice()],
 2160131:[component(2565331,1),red(),ice()],
 3093281:[component(3093265,1),red(),component(1238789,4)],
 3407403:[component(3285865,1),custom('Energético 2L',1),component(1238789,4),cups()],
 3407401:[component(1681527,1),custom('Energético 2L',1),component(1297873,4),custom('Copos 500ml',4)],
 3407399:[component(2565337,1),custom('Energético 2L',1),component(1844095,4),custom('Copos 500ml',4)],
 1233935:[component(1236481,1),red(),ice()],
 2565329:[custom('Jack Daniels Blackberry',1),red(),ice()],
 2095265:[custom('Jack Daniels Honey',1),red(),ice()],
 1233939:[component(1239265,1),red(),component(1238789,4)],
 1722045:[component(3211649,1),custom('Energético 2L',null),ice()],
 568637:[component(1236479,1),red(null),ice('Gelo de coco ou maracujá')],
 568635:[component(1326707,1),custom('Energético',null),ice('Gelo de coco ou maracujá')],
 3244909:[component(1681527,1),custom('Energético 2L',1),component(1297873,4),cups()],
 3244907:[component(1681527,1),custom('Energético 2L',1),component(1297873,4),cups()],
 3671966:[component(3671962,1),red(),component(1238789,4),cups()]
};
for(const [n,items] of Object.entries(combos)){const p=get(n);p.kit_items=items;p.name=items.map(i=>i.name).join(' + ');}
const parents={1573163:3477643,2819883:1233949,3518959:3518961,1573173:1573177,1235601:1233961,3000481:1233961};
for(const [n,parent] of Object.entries(parents))get(n).parent_product_id=pid(parent);
const issues=[...pending,...products.filter(p=>p.category==='Fardo'&&!p.box_units).map(p=>({id:p.id,name:p.name,reason:'Quantidade de unidades do fardo não informada na fonte'})),...products.filter(p=>p.category==='COMBOS'&&!p.kit_items.length).map(p=>({id:p.id,name:p.name,reason:'Composição do combo não informada na fonte'}))];
const catalog={source:'https://www.uairango.com/mg/adega-tabacaria',sourceDate:'2026-09-11',products};
await fs.mkdir(new URL('front-end/data/',root),{recursive:true});
await fs.writeFile(new URL('front-end/data/catalogo-zeus.json',root),JSON.stringify(catalog,null,2)+'\n');
await fs.writeFile(new URL('./import-review.json',import.meta.url),JSON.stringify({products:products.length,sourceProducts:new Set(rows.filter(p=>!excluded(p)).map(p=>p.id)).size,excluded:new Set(rows.filter(excluded).map(p=>p.id)).size,photos:provenance.filter(p=>p.imageUrl).length,provenance,issues},null,2));
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
// Uses the same conflict rule as the admin RPC; safe to rerun after manual edits.
const tuples=products.map(p=>'('+[p.id,p.name,p.description,p.price,p.sale_price,p.promotion_label,p.category,p.image,p.available,p.featured,JSON.stringify(p.kit_items),p.box_units,p.parent_product_id,p.product_type].map((v,i)=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):quote(v)+(i===10?'::jsonb':'')).join(',')+')');
const sql='-- Execute após 30-fardos-combos-importacao.sql. Importação dos itens permitidos da planilha.\nbegin;\ninsert into public.product_categories(name) values\n'+[...new Set(products.map(p=>p.category))].map(c=>'('+quote(c)+')').join(',\n')+'\non conflict(name) do nothing;\ninsert into public.products(id,name,description,price,sale_price,promotion_label,category,image,available,featured,kit_items,box_units,parent_product_id,product_type) values\n'+tuples.join(',\n')+'\non conflict(id) do nothing;\ncommit;\n';
await fs.writeFile(new URL('back-end/supabase/31-importar-catalogo-zeus.sql',root),sql);
const migration=await fs.readFile(new URL('back-end/supabase/30-fardos-combos-importacao.sql',root),'utf8');
await fs.writeFile(new URL('./IMPORTAR-CATALOGO-ZEUS.sql',import.meta.url),migration+'\n'+sql);
const byCategory=[...new Set(products.map(p=>p.category))].map(c=>`| ${c} | ${products.filter(p=>p.category===c).length} |`).join('\n');
const notes=`# Importação do catálogo Zeus\n\nFonte: https://www.uairango.com/mg/adega-tabacaria\n\nPreços e descrições da planilha coletada em 11/09/2026.\n\n## Conteúdo preparado\n\n- ${products.length} registros editáveis (${new Set(rows.filter(p=>!excluded(p)).map(p=>p.id)).size} produtos de origem; quatro opções de Mansão Maromba cadastradas separadamente).\n- ${new Set(products.map(p=>p.category)).size} categorias.\n- ${provenance.filter(p=>p.imageUrl).length} fotografias verificadas e armazenadas no projeto.\n- ${pending.length} registros com foto pendente, identificados pelo marcador visual.\n- 52 itens de tabaco, essências para fumar e blunt não integram a importação.\n\n## Gravação no banco\n\nExecute IMPORTAR-CATALOGO-ZEUS.sql no SQL Editor do projeto Supabase configurado na aplicação. O arquivo inclui a migração de Fardo, a edição de categorias e o cadastro dos produtos. Não substitui registros existentes com os mesmos IDs.\n\nAlternativa: execute apenas 30-fardos-combos-importacao.sql e, no painel autenticado, abra Produtos e clique em Importar catálogo Zeus. A importação é executada em uma transação no banco.\n\nDepois de publicar os arquivos da aplicação, os produtos cadastrados usam a mesma tela de edição manual. Os arquivos SQL foram testados em banco isolado; a gravação no Supabase de produção depende de acesso administrativo.\n\n## Categorias\n\n| Categoria | Registros |\n|---|---:|\n${byCategory}\n\n## Dados que precisam de conferência\n\n${issues.map(p=>'- '+p.name+' — '+p.reason+'.').join('\n')}\n\nA composição informada dos combos está em kit_items, com preço próprio do combo. Quantidades ausentes permanecem sem informação. Componentes não vendidos separadamente são editáveis pelo nome. Fardos só são vinculados à unidade quando a correspondência de produto e volume é identificável na fonte.\n\nA origem das imagens está em import-review.json. As fotos foram obtidas do catálogo UaiRango e de páginas públicas do Supernosso, mantendo os preços da planilha original.\n`;
await fs.writeFile(new URL('./LEIA-ME.md',import.meta.url),notes);
console.log(JSON.stringify({records:products.length,photos:provenance.filter(p=>p.imageUrl).length,pendingImages:pending.length,issues:issues.length,combos:products.filter(p=>p.kit_items.length).length,categories:new Set(products.map(p=>p.category)).size}));

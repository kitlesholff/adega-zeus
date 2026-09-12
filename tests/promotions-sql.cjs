const {PGlite}=require('../.test-tools/node_modules/@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const read=name=>fs.readFileSync(`back-end/supabase/${name}`,'utf8').replace(/create extension if not exists pgcrypto;/g,'');

(async()=>{const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    create function auth.role() returns text language sql as $$select current_user::text$$;
    grant usage on schema auth to anon,authenticated;`);
  for(const file of ['schema.sql','01-restringir-admin.sql','18-validar-pedidos.sql','24-promocoes.sql','26-nome-promocao.sql','27-promocao-caixinha.sql'])await db.exec(read(file));
  await db.exec(`insert into public.products(id,name,description,price,sale_price,promotion_label,category,image,available,box_option)
    values('promo','Produto promo','',12.50,9.90,'Promoção da unidade','Teste','x',true,'{"units":12,"price":60,"sale_price":50,"promotion_label":"Promoção da caixinha","image":"box.webp"}');set role anon;`);
  const payload={customerName:'Cliente',deliveryType:'Retirada',address:'',payment:'Pix',notes:'',clientTotal:69.8,items:[{productId:'promo',quantity:2,variant:'unit'},{productId:'promo',quantity:1,variant:'box'}]};
  const order=(await db.query('select public.create_order($1::jsonb) data',[JSON.stringify(payload)])).rows[0].data;
  assert.equal(Number(order.trustedTotal),69.8);
  assert.deepEqual(order.items.map(item=>Number(item.unitPrice)).sort((a,b)=>a-b),[9.9,50]);
  assert.equal(Number((await db.query(`select price from public.products where id='promo'`)).rows[0].price),12.5);
  await db.exec('reset role');
  await assert.rejects(db.exec(`update public.products set sale_price=13 where id='promo'`),/products_sale_price_valid/);
  console.log('OK: promoções independentes da unidade e da caixinha aplicadas sem alterar os preços originais.');
}finally{await db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});

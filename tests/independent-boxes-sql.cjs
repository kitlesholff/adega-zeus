const {PGlite}=require('../.test-tools/node_modules/@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;`);
  await db.exec(fs.readFileSync('back-end/supabase/schema.sql','utf8').replace('create extension if not exists pgcrypto;',''));
  await db.exec(`create table public.product_categories(name text primary key);insert into public.products(id,name,price,category,image,box_option) values('beer','Cerveja',6,'Cervejas','unit.jpg','{"units":12,"price":60,"sale_price":50,"image":"box.jpg"}');`);
  const migration=fs.readFileSync('back-end/supabase/28-caixinhas-produtos-independentes.sql','utf8');
  await db.exec(migration);await db.exec(migration);
  const rows=(await db.query('select * from public.products')).rows;
  assert.equal(rows.length,2);
  const box=rows.find(p=>p.parent_product_id==='beer');
  assert.equal(box.category,'Caixinhas');assert.equal(Number(box.sale_price),50);assert.equal(box.box_units,12);
  assert.equal(rows.find(p=>p.id==='beer').box_option,null);
  assert.equal(Number(rows.find(p=>p.id==='beer').price),6);
  console.log('OK: conversão repetível preserva a cerveja e cria uma caixinha independente.');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

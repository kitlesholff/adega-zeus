const {PGlite}=require('../.test-tools/node_modules/@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create table public.product_categories(name text primary key);create table public.products(id text,category text);create function public.is_admin() returns boolean language sql as $$select current_setting('test.admin',true)='yes'$$;set test.admin='yes';insert into public.product_categories values('Cervejas');insert into public.products values('box','Caixinhas');`);
  const sql=fs.readFileSync('back-end/supabase/29-categorias-editaveis.sql','utf8');
  await db.exec(sql);await db.exec(sql);
  await assert.rejects(db.exec("delete from public.product_categories where name='Caixinhas'"),/não pode ser excluída/);
  await db.exec("select public.rename_product_category('Caixinhas','Caixas fechadas')");
  assert.equal((await db.query('select category from public.products')).rows[0].category,'Caixas fechadas');
  await assert.rejects(db.exec("delete from public.product_categories where name='Caixas fechadas'"),/não pode ser excluída/);
  await db.exec(sql);
  assert.equal((await db.query("select count(*)::int n from public.product_categories where system_key='boxes'")).rows[0].n,1);
  await db.exec("select public.rename_product_category('Cervejas','Bebidas');delete from public.product_categories where name='Bebidas';set test.admin='no';");
  await assert.rejects(db.exec("select public.rename_product_category('Caixas fechadas','Indevido')"),/restrito/);
  console.log('OK: renomeação, produtos atualizados e proteção permanente contra exclusão.');
}finally{await db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});

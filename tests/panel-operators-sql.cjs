// Executa a auditoria final em PostgreSQL isolado; nunca acessa o Supabase real.
const { PGlite } = require('../.test-tools/node_modules/@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const admin = '00000000-0000-0000-0000-000000000001';
const read = name => fs.readFileSync(`back-end/supabase/${name}`, 'utf8')
  .replace(/create extension if not exists pgcrypto;/g, '');

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as
        $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
      create function auth.role() returns text language sql as $$ select coalesce(nullif(current_setting('test.role', true),''),current_user::text) $$;
      create function auth.jwt() returns jsonb language sql as $$ select '{"email":"admin@zeus.test"}'::jsonb $$;
      create table storage.buckets(
        id text primary key, name text not null, public boolean not null default false,
        file_size_limit bigint, allowed_mime_types text[]
      );
      create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text not null);
      alter table storage.objects enable row level security;
      grant usage on schema auth, storage to anon, authenticated;
      insert into auth.users values ('${admin}');
      set test.user_id = '${admin}';
    `);
    for (const file of ['schema.sql', '01-restringir-admin.sql']) await db.exec(read(file));
    await db.exec(`insert into private.admin_users(user_id) values ('${admin}')`);
    for (const file of [
      '02-criar-saidas.sql', '03-storage-produtos.sql', '04-categorias-produtos.sql',
      '06-fechamento-caixa.sql', '07-catalogo-publico.sql', '08-abertura-fechamento.sql',
      '09-confirmacao-recebimento.sql', '10-rotina-diaria-reset.sql',
      '11-pendencias-cancelamento.sql', '12-fechamento-todos-pagamentos.sql',
      '13-kits-produtos.sql', '14-caixinhas-produtos.sql', '16-remover-catalogo-demonstracao.sql',
      '18-validar-pedidos.sql', '20-proteger-caixa.sql', '22-corrigir-leitura-financeira.sql'
    ]) await db.exec(read(file));

    for(const file of fs.readdirSync('back-end/supabase').filter(file=>/^(24|25|26|27|28|29|30)-.*\.sql$/.test(file)).sort()) await db.exec(read(file));

    await db.exec(read('32-restringir-gravacao-visitantes.sql'));
    await db.exec(read('33-operadores-pedidos-caixa.sql'));
    await db.exec(read('33-operadores-pedidos-caixa.sql'));
    const operator='00000000-0000-0000-0000-000000000002',stranger='00000000-0000-0000-0000-000000000003';
    await db.exec(`insert into auth.users values ('${operator}'),('${stranger}'); grant usage on schema public,auth to service_role; set test.role='service_role'; set role service_role;`);
    await db.query('select public.register_panel_operator($1,$2,$3,$4)',[operator,'Operador','operador@zeus.test',admin]);
    await db.exec(`reset role; set test.role='authenticated'; set test.user_id='${operator}'; set role authenticated;`);
    assert.equal((await db.query('select public.panel_role() as role')).rows[0].role,'operator');
    assert.equal((await db.query('select public.is_admin() as admin')).rows[0].admin,false);
    await assert.rejects(db.query('select public.list_panel_operators()'),/Acesso negado/);
    await assert.rejects(db.query('select public.set_panel_operator_active($1,false)',[operator]),/Acesso negado/);
    await assert.rejects(db.query('select public.register_panel_operator($1,$2,$3,$4)',[stranger,'Outro','outro@zeus.test',admin]),/permission denied/);
    await assert.rejects(db.query("select public.reset_operational_data('ZERAR')"),/Acesso negado/);
    await assert.rejects(db.query("select public.import_catalog_products('[]'::jsonb)"),/restrito/);
    await assert.rejects(db.exec("insert into public.products(id,name,description,price,category,image) values('blocked','Bloqueado','Teste',10,'Teste','x')"),/row-level security/);
    await assert.rejects(db.exec("insert into storage.objects(bucket_id) values('product-images')"),/permission denied|row-level security/);
    const rpc=async(action,p={})=>(await db.query('select public.cash_register($1,$2) as data',[action,JSON.stringify(p)])).rows[0].data;
    let state=await rpc('open',{opening_cash:100});
    assert.ok(state.session.id);assert.equal(state.session.created_by,operator);
    state=await rpc('movement',{id:'20000000-0000-0000-0000-000000000001',session_id:state.session.id,kind:'expense',method:'cash',amount:10,description:'Despesa de teste'});
    assert.equal(state.movements.length,1);
    await db.exec("reset role; insert into public.products(id,name,description,price,category,image) values('test','Produto','Teste',10,'Teste','x'); set role authenticated;");
    const order=(await db.query('select public.create_order($1) as data',[JSON.stringify({customerName:'Cliente Teste',deliveryType:'Retirada',address:'',payment:'Dinheiro',notes:'',clientTotal:10,items:[{productId:'test',quantity:1}]})])).rows[0].data;
    await db.query("select public.set_order_status($1,'confirmed')",[order.id]);
    assert.equal((await db.query('select status from public.orders_with_items where id=$1',[order.id])).rows[0].status,'confirmed');
    assert.equal((await db.query("update public.products set price=1 where id='test' returning id")).rows.length,0);
    state=await rpc('preview');
    assert.ok(state.movements.some(m=>m.kind==='receipt'&&m.created_by===operator));
    state=await rpc('close',{session_id:state.session.id,fingerprint:state.fingerprint,revision:0,counted_cash:100,notes:'Conferencia do operador'});
    assert.equal(Number(state.latest.expected_cash),100);
    await db.exec(`set test.user_id='${admin}'`);
    assert.equal((await db.query('select count(*) as count from public.list_panel_operators()')).rows[0].count,1);
    await db.query('select public.set_panel_operator_active($1,false)',[operator]);
    await db.exec(`set test.user_id='${operator}'`);
    assert.equal((await db.query('select public.panel_role() as role')).rows[0].role,null);
    await assert.rejects(rpc('preview'),/Acesso negado/);
    assert.equal((await db.query('select * from public.orders')).rows.length,0);
    await db.exec(`set test.user_id='${stranger}'`);
    assert.equal((await db.query('select public.panel_role() as role')).rows[0].role,null);
    await assert.rejects(rpc('preview'),/Acesso negado/);
    console.log('OK: operador abre/movimenta/fecha caixa e confirma pedidos; produtos, usuarios, imagens e reset protegidos; revogacao imediata.');
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

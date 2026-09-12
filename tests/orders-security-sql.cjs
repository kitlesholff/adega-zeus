// Valida pedidos em PostgreSQL isolado; nenhum dado é enviado ao Supabase real.
const { PGlite } = require('../.test-tools/node_modules/@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const read = name => fs.readFileSync(`back-end/supabase/${name}`, 'utf8').replace(/create extension if not exists pgcrypto;/g, '');

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create function auth.role() returns text language sql as $$ select current_user::text $$;
      grant usage on schema auth to anon, authenticated;`);
    await db.exec(read('schema.sql'));
    await db.exec(read('01-restringir-admin.sql'));
    await db.exec(read('18-validar-pedidos.sql'));
    const audit = await db.query(read('19-validar-passo-3.sql'));
    assert.equal(audit.rows.length, 8);
    assert.ok(audit.rows.every(check => check.resultado === 'OK'), JSON.stringify(audit.rows));
    await db.exec(`insert into public.products(id,name,description,price,category,image,available)
      values('real-test','Produto isolado','',12.50,'Teste','x',true); set role anon;`);

    const create = payload => db.query('select public.create_order($1::jsonb) data', [JSON.stringify(payload)]);
    const base = { customerName:'Cliente', deliveryType:'Retirada', address:'', payment:'Pix', notes:'', clientTotal:1,
      items:[{productId:'real-test',quantity:2,variant:'unit'}] };
    const valid = (await create(base)).rows[0].data;
    assert.match(valid.code, /^AZ[A-F0-9]{10}$/);
    assert.equal(Number(valid.trustedTotal), 25);
    assert.equal(Number(valid.clientTotal), 1);
    await db.exec(`reset role; update public.products set sale_price=10 where id='real-test'; set role anon;`);
    const promotional = (await create(base)).rows[0].data;
    assert.equal(Number(promotional.trustedTotal), 20);
    assert.equal(Number(promotional.items[0].unitPrice), 10);
    assert.equal(Number((await db.query(`select price from public.products where id='real-test'`)).rows[0].price), 12.5);

    for (const invalid of [
      {...base, customerName:'X'},
      {...base, deliveryType:'Entrega', address:''},
      {...base, payment:'Crédito inventado'},
      {...base, items:[]},
      {...base, items:[{productId:'inexistente',quantity:1}]},
      {...base, items:[{productId:'real-test',quantity:'1.5'}]},
      {...base, notes:'x'.repeat(251)}
    ]) await assert.rejects(create(invalid));

    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int total from public.orders')).rows[0].total, 2);
    assert.equal((await db.query('select count(*)::int total from public.order_items')).rows[0].total, 2);
    console.log('OK: preço recalculado, código AZ e entradas inválidas recusadas sem gravação parcial.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

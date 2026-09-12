// Valida a fundação do banco em PostgreSQL isolado; nunca acessa o Supabase real.
const { PGlite } = require('../.test-tools/node_modules/@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const admin = '00000000-0000-0000-0000-000000000001';
const guest = '00000000-0000-0000-0000-000000000002';
const read = name => fs.readFileSync(`back-end/supabase/${name}`, 'utf8').replace(/create extension if not exists pgcrypto;/g, '');

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as
        $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
      create function auth.role() returns text language sql as $$ select current_user::text $$;
      grant usage on schema auth to anon, authenticated;
      insert into auth.users values ('${admin}'), ('${guest}');
      set test.user_id='${admin}';
    `);
    await db.exec(read('schema.sql'));
    await db.exec(read('01-restringir-admin.sql'));
    await db.exec(`insert into private.admin_users(user_id) values ('${admin}')`);
    await db.exec(read('01-restringir-admin.sql'));
    await db.exec(`insert into public.products(id,name,price,category,image,available) values
      ('visivel','Visível',1,'Teste','x',true), ('oculto','Oculto',1,'Teste','x',false)`);

    await db.exec(`set role anon`);
    assert.deepEqual((await db.query(`select id from public.products order by id`)).rows.map(row => row.id), ['visivel']);
    await assert.rejects(db.query('select public.is_admin()'), /permission denied/);
    await assert.rejects(db.exec(`insert into public.products(id,name,price,category,image) values('x','X',1,'X','x')`), /permission denied/);

    await db.exec(`reset role; set test.user_id='${guest}'; set role authenticated`);
    assert.equal((await db.query('select * from public.products')).rows.length, 0);
    assert.equal((await db.query(`update public.products set price=1 returning id`)).rows.length, 0);

    await db.exec(`reset role; set test.user_id='${admin}'; set role authenticated`);
    assert.equal((await db.query('select * from public.products')).rows.length, 2);
    await db.exec(`insert into public.products(id,name,price,category,image) values('admin-ok','Admin',1,'Teste','x')`);
    assert.equal((await db.query(`select public.is_admin() allowed`)).rows[0].allowed, true);
    await db.exec(`reset role`);
    await db.exec(read('04-categorias-produtos.sql'));
    await db.exec(`insert into public.products(id,name,price,category,image) values('long-neck','Demonstração',1,'Cervejas','x');
      insert into public.product_categories(name) values('Cervejas') on conflict do nothing`);
    await db.exec(read('16-remover-catalogo-demonstracao.sql'));
    assert.equal((await db.query(`select count(*)::int total from public.products where id='long-neck'`)).rows[0].total, 0);
    assert.equal((await db.query(`select count(*)::int total from public.product_categories where name='Cervejas'`)).rows[0].total, 0);
    assert.equal((await db.query(`select count(*)::int total from public.product_categories where name='Teste'`)).rows[0].total, 1);
    console.log('OK: visitante, usuário comum e administrador recebem somente as permissões previstas.');
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

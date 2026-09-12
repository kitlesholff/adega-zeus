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
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as
        $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
      create function auth.role() returns text language sql as $$ select current_user::text $$;
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

    const audit = await db.query(read('23-validar-producao.sql'));
    assert.equal(audit.rows.length, 14);
    assert.ok(audit.rows.every(check => check.resultado === 'OK'), JSON.stringify(audit.rows));
    console.log('OK: auditoria final de produção retornou 14 de 14 controles aprovados.');
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

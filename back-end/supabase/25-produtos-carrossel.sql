-- Execute após 24-promocoes.sql.
-- Permite escolher produtos reais do catálogo para o carrossel da página inicial.
begin;

alter table public.products
  add column if not exists featured boolean not null default false;

commit;

-- Execute após 12-fechamento-todos-pagamentos.sql.
-- Adiciona a composição opcional de kits sem alterar pedidos ou produtos existentes.
begin;

alter table public.products
  add column if not exists kit_items jsonb not null default '[]'::jsonb;

alter table public.products
  drop constraint if exists products_kit_items_valid;

alter table public.products
  add constraint products_kit_items_valid check (
    jsonb_typeof(kit_items) = 'array'
    and jsonb_array_length(kit_items) <= 50
  );

commit;

-- Execute após 25-produtos-carrossel.sql.
-- Permite personalizar a chamada exibida nos produtos em promoção.
begin;

alter table public.products
  add column if not exists promotion_label text;

alter table public.products
  drop constraint if exists products_promotion_label_length;

alter table public.products
  add constraint products_promotion_label_length
  check (promotion_label is null or length(promotion_label) <= 50);

commit;

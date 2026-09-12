-- Execute após 23-validar-producao.sql.
-- Adiciona preço promocional sem substituir o preço original do produto.
begin;

alter table public.products add column if not exists sale_price numeric(10,2);
alter table public.products drop constraint if exists products_sale_price_valid;
alter table public.products add constraint products_sale_price_valid check (
  sale_price is null
  or (sale_price > 0 and sale_price < price and sale_price = round(sale_price, 2))
);

-- Compatibilidade com a função de pedidos já instalada: para unidades,
-- troca somente o valor gravado no novo item. Caixinhas preservam seu preço.
create or replace function public.apply_product_promotion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare product_row public.products;
begin
  select * into product_row from public.products where id = new.product_id;
  if product_row.id is not null
    and new.name = product_row.name
    and product_row.sale_price is not null
    and product_row.sale_price > 0
    and product_row.sale_price < product_row.price then
    new.unit_price := product_row.sale_price;
    new.subtotal := product_row.sale_price * new.quantity;
  end if;
  return new;
end;
$$;

drop trigger if exists order_item_apply_product_promotion on public.order_items;
create trigger order_item_apply_product_promotion
before insert on public.order_items
for each row execute function public.apply_product_promotion();

-- A versão anterior da função create_order calcula o total antes de inserir
-- os itens. Recalcular aqui mantém o total confiável igual ao preço promocional.
create or replace function public.refresh_order_total_from_items()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.orders
  set trusted_total = (
    select coalesce(sum(item.subtotal), 0)
    from public.order_items item
    where item.order_id = new.order_id
  )
  where id = new.order_id;
  return new;
end;
$$;

drop trigger if exists order_items_refresh_order_total on public.order_items;
create trigger order_items_refresh_order_total
after insert on public.order_items
for each row execute function public.refresh_order_total_from_items();

revoke all on function public.apply_product_promotion() from public, anon, authenticated;
revoke all on function public.refresh_order_total_from_items() from public, anon, authenticated;

commit;

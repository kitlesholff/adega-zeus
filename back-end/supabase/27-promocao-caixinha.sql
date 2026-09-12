-- Execute após 26-nome-promocao.sql.
-- Aplica promoções da unidade e da caixinha de forma independente.
begin;

create or replace function public.apply_product_promotion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  product_row public.products;
  box_sale numeric;
  box_original numeric;
begin
  select * into product_row from public.products where id = new.product_id;

  if product_row.id is null then
    return new;
  end if;

  if new.name = product_row.name
    and product_row.sale_price is not null
    and product_row.sale_price > 0
    and product_row.sale_price < product_row.price then
    new.unit_price := product_row.sale_price;
    new.subtotal := product_row.sale_price * new.quantity;
  elsif product_row.box_option is not null
    and new.name = 'Caixinha de ' || product_row.name || ' (' || (product_row.box_option->>'units') || ' un.)' then
    box_sale := nullif(product_row.box_option->>'sale_price', '')::numeric;
    box_original := nullif(product_row.box_option->>'price', '')::numeric;
    if box_sale is not null and box_sale > 0 and box_sale < box_original then
      new.unit_price := box_sale;
      new.subtotal := box_sale * new.quantity;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.apply_product_promotion() from public, anon, authenticated;

commit;

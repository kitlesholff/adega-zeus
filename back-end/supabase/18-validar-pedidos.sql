-- Endurece a entrada pública de pedidos e aplica a identidade da Adega Zeus.
-- Execute depois de 14-caixinhas-produtos.sql.
begin;

alter table public.orders drop constraint if exists orders_customer_name_valid;
alter table public.orders add constraint orders_customer_name_valid
  check (length(trim(customer_name)) between 2 and 80);

alter table public.orders drop constraint if exists orders_delivery_type_valid;
alter table public.orders add constraint orders_delivery_type_valid
  check (delivery_type in ('Entrega', 'Retirada'));

alter table public.orders drop constraint if exists orders_address_valid;
alter table public.orders add constraint orders_address_valid
  check (
    length(address) <= 180
    and (delivery_type <> 'Entrega' or length(trim(address)) between 5 and 180)
  );

alter table public.orders drop constraint if exists orders_payment_valid;
alter table public.orders add constraint orders_payment_valid
  check (payment in (
    'Pix', 'Dinheiro', 'Cartão na entrega', 'Cartão de débito', 'Cartão de crédito'
  ));

alter table public.orders drop constraint if exists orders_notes_valid;
alter table public.orders add constraint orders_notes_valid
  check (length(notes) <= 250);

alter table public.orders drop constraint if exists orders_totals_valid;
alter table public.orders add constraint orders_totals_valid
  check (client_total >= 0 and trusted_total > 0);

create or replace function public.create_order(order_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_order_id uuid;
  new_code text;
  trusted numeric(10,2);
  result jsonb;
  item_count integer;
  valid_item_count integer;
  customer_name_input text;
  delivery_type_input text;
  address_input text;
  payment_input text;
  notes_input text;
  client_total_input numeric(10,2);
begin
  if order_payload is null or jsonb_typeof(order_payload) <> 'object' then
    raise exception 'Pedido inválido.';
  end if;

  customer_name_input := trim(coalesce(order_payload->>'customerName', ''));
  delivery_type_input := coalesce(order_payload->>'deliveryType', '');
  address_input := trim(coalesce(order_payload->>'address', ''));
  payment_input := coalesce(order_payload->>'payment', '');
  notes_input := trim(coalesce(order_payload->>'notes', ''));

  if length(customer_name_input) not between 2 and 80 then
    raise exception 'Informe seu nome (2 a 80 caracteres).';
  end if;
  if delivery_type_input not in ('Entrega', 'Retirada') then
    raise exception 'Escolha entrega ou retirada.';
  end if;
  if delivery_type_input = 'Entrega' and length(address_input) not between 5 and 180 then
    raise exception 'Informe o endereço de entrega completo.';
  end if;
  if length(address_input) > 180 then raise exception 'Endereço muito longo.'; end if;
  if payment_input not in ('Pix', 'Dinheiro', 'Cartão na entrega', 'Cartão de débito', 'Cartão de crédito') then
    raise exception 'Escolha uma forma de pagamento válida.';
  end if;
  if length(notes_input) > 250 then raise exception 'Use até 250 caracteres nas observações.'; end if;
  if coalesce(order_payload->>'clientTotal', '') !~ '^[0-9]+([.][0-9]{1,2})?$' then
    raise exception 'Total informado inválido.';
  end if;
  client_total_input := (order_payload->>'clientTotal')::numeric;

  if jsonb_typeof(order_payload->'items') is distinct from 'array' then
    raise exception 'Carrinho inválido.';
  end if;
  item_count := jsonb_array_length(order_payload->'items');
  if item_count not between 1 and 50 then raise exception 'Carrinho vazio ou muito grande.'; end if;

  if exists (
    select 1
    from jsonb_array_elements(order_payload->'items') item
    where jsonb_typeof(item) <> 'object'
      or length(coalesce(item->>'productId', '')) = 0
      or not case
        when coalesce(item->>'quantity', '') ~ '^[1-9][0-9]{0,2}$'
          then (item->>'quantity')::integer between 1 and 100
        else false
      end
      or coalesce(item->>'variant', 'unit') not in ('unit', 'box')
  ) then
    raise exception 'Há um item inválido no carrinho.';
  end if;

  select count(*), coalesce(sum(
    (case when item->>'variant' = 'box' then (product.box_option->>'price')::numeric else coalesce(product.sale_price, product.price) end)
    * (item->>'quantity')::integer
  ), 0)
  into valid_item_count, trusted
  from jsonb_array_elements(order_payload->'items') item
  join public.products product
    on product.id = item->>'productId'
   and product.available = true
   and (item->>'variant' is distinct from 'box' or product.box_option is not null);

  if valid_item_count <> item_count or trusted <= 0 then
    raise exception 'Um produto do carrinho não está mais disponível.';
  end if;

  new_code := 'AZ' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.orders(
    code, customer_name, delivery_type, address, payment, notes, client_total, trusted_total
  ) values (
    new_code, customer_name_input, delivery_type_input, address_input,
    payment_input, notes_input, client_total_input, trusted
  ) returning id into new_order_id;

  insert into public.order_items(order_id, product_id, name, quantity, unit_price, subtotal)
  select
    new_order_id,
    product.id,
    case when item->>'variant' = 'box'
      then 'Caixinha de ' || product.name || ' (' || (product.box_option->>'units') || ' un.)'
      else product.name
    end,
    (item->>'quantity')::integer,
    case when item->>'variant' = 'box' then (product.box_option->>'price')::numeric else coalesce(product.sale_price, product.price) end,
    (case when item->>'variant' = 'box' then (product.box_option->>'price')::numeric else coalesce(product.sale_price, product.price) end)
      * (item->>'quantity')::integer
  from jsonb_array_elements(order_payload->'items') item
  join public.products product
    on product.id = item->>'productId'
   and product.available = true
   and (item->>'variant' is distinct from 'box' or product.box_option is not null);

  select jsonb_build_object(
    'id', order_row.id,
    'code', order_row.code,
    'customerName', order_row.customer_name,
    'deliveryType', order_row.delivery_type,
    'address', order_row.address,
    'payment', order_row.payment,
    'notes', order_row.notes,
    'clientTotal', order_row.client_total,
    'trustedTotal', order_row.trusted_total,
    'status', order_row.status,
    'createdAt', order_row.created_at,
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'productId', item_row.product_id,
      'name', item_row.name,
      'quantity', item_row.quantity,
      'unitPrice', item_row.unit_price,
      'subtotal', item_row.subtotal
    )) filter (where item_row.id is not null), '[]'::jsonb)
  )
  into result
  from public.orders order_row
  left join public.order_items item_row on item_row.order_id = order_row.id
  where order_row.id = new_order_id
  group by order_row.id;

  return result;
end;
$$;

revoke all on function public.create_order(jsonb) from public;
grant execute on function public.create_order(jsonb) to anon, authenticated;

commit;

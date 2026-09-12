-- Execute após 13-kits-produtos.sql.
-- Adiciona uma opção de caixinha com quantidade, preço e imagem próprios.
begin;

alter table public.products add column if not exists box_option jsonb;
alter table public.products drop constraint if exists products_box_option_valid;
alter table public.products add constraint products_box_option_valid check (
  box_option is null or (
    jsonb_typeof(box_option)='object'
    and jsonb_typeof(box_option->'units')='number'
    and (box_option->>'units')::numeric between 2 and 100
    and (box_option->>'units')::numeric=round((box_option->>'units')::numeric)
    and jsonb_typeof(box_option->'price')='number'
    and (box_option->>'price')::numeric between 0.01 and 99999999.99
    and (box_option->>'price')::numeric=round((box_option->>'price')::numeric,2)
    and jsonb_typeof(box_option->'image')='string'
    and length(trim(box_option->>'image'))>0
  )
);

create or replace function public.create_order(order_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare new_order_id uuid; new_code text; trusted numeric(10,2); result jsonb;
begin
  if coalesce(length(trim(order_payload->>'customerName')),0)<2 then raise exception 'Informe seu nome.'; end if;
  if jsonb_array_length(order_payload->'items')=0 then raise exception 'Carrinho vazio.'; end if;

  select coalesce(sum((case when item->>'variant'='box' then (p.box_option->>'price')::numeric else p.price end)*greatest(1,least(100,(item->>'quantity')::int))),0)
    into trusted from jsonb_array_elements(order_payload->'items') item
    join public.products p on p.id=item->>'productId' and p.available=true
      and coalesce(item->>'variant','unit') in ('unit','box')
      and (item->>'variant' is distinct from 'box' or p.box_option is not null);
  if trusted<=0 then raise exception 'Nenhum produto válido no pedido.'; end if;
  new_code := 'AZ'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));

  insert into public.orders(code,customer_name,delivery_type,address,payment,notes,client_total,trusted_total)
  values(new_code,trim(order_payload->>'customerName'),order_payload->>'deliveryType',coalesce(order_payload->>'address',''),order_payload->>'payment',coalesce(order_payload->>'notes',''),(order_payload->>'clientTotal')::numeric,trusted)
  returning id into new_order_id;

  insert into public.order_items(order_id,product_id,name,quantity,unit_price,subtotal)
  select new_order_id,p.id,
    case when item->>'variant'='box' then 'Caixinha de '||p.name||' ('||(p.box_option->>'units')||' un.)' else p.name end,
    greatest(1,least(100,(item->>'quantity')::int)),
    case when item->>'variant'='box' then (p.box_option->>'price')::numeric else p.price end,
    (case when item->>'variant'='box' then (p.box_option->>'price')::numeric else p.price end)*greatest(1,least(100,(item->>'quantity')::int))
  from jsonb_array_elements(order_payload->'items') item
  join public.products p on p.id=item->>'productId' and p.available=true
    and coalesce(item->>'variant','unit') in ('unit','box')
    and (item->>'variant' is distinct from 'box' or p.box_option is not null);

  select jsonb_build_object('id',o.id,'code',o.code,'customerName',o.customer_name,'deliveryType',o.delivery_type,'address',o.address,'payment',o.payment,'notes',o.notes,'clientTotal',o.client_total,'trustedTotal',o.trusted_total,'status',o.status,'createdAt',o.created_at,'items',coalesce(jsonb_agg(jsonb_build_object('productId',i.product_id,'name',i.name,'quantity',i.quantity,'unitPrice',i.unit_price,'subtotal',i.subtotal)),'[]'::jsonb))
  into result from public.orders o left join public.order_items i on i.order_id=o.id where o.id=new_order_id group by o.id;
  return result;
end;
$$;

revoke all on function public.create_order(jsonb) from public;
grant execute on function public.create_order(jsonb) to anon,authenticated;
commit;

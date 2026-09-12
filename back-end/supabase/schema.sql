-- Execute este arquivo no SQL Editor de um novo projeto Supabase.
create extension if not exists pgcrypto;

create table if not exists public.products (
  id text primary key,
  name text not null,
  description text not null default '',
  price numeric(10,2) not null check (price >= 0),
  sale_price numeric(10,2),
  promotion_label text check (promotion_label is null or length(promotion_label) <= 50),
  category text not null,
  image text not null,
  available boolean not null default true,
  featured boolean not null default false,
  kit_items jsonb not null default '[]'::jsonb,
  box_option jsonb,
  parent_product_id text references public.products(id) on delete set null,
  box_units integer check (box_units between 2 and 100),
  created_at timestamptz not null default now()
);

alter table public.products add constraint products_sale_price_valid
  check (sale_price is null or (sale_price > 0 and sale_price < price and sale_price = round(sale_price, 2)));

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  customer_name text not null,
  delivery_type text not null,
  address text not null default '',
  payment text not null,
  notes text not null default '',
  client_total numeric(10,2) not null,
  trusted_total numeric(10,2) not null,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null,
  name text not null,
  quantity integer not null check (quantity > 0 and quantity <= 100),
  unit_price numeric(10,2) not null,
  subtotal numeric(10,2) not null
);

alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

revoke all on public.products from anon, authenticated;
revoke all on public.orders from anon, authenticated;
revoke all on public.order_items from anon, authenticated;
grant select on public.products to anon;

create policy "catalogo visitante" on public.products
  for select to anon using (available = true);

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
begin
  if coalesce(length(trim(order_payload->>'customerName')),0) < 2 then raise exception 'Informe seu nome.'; end if;
  if jsonb_array_length(order_payload->'items') = 0 then raise exception 'Carrinho vazio.'; end if;

  select coalesce(sum((case when item->>'variant'='box' then (p.box_option->>'price')::numeric else p.price end) * greatest(1, least(100, (item->>'quantity')::int))),0)
    into trusted
    from jsonb_array_elements(order_payload->'items') item
    join public.products p on p.id = item->>'productId' and p.available = true
      and coalesce(item->>'variant','unit') in ('unit','box')
      and (item->>'variant' is distinct from 'box' or p.box_option is not null);

  if trusted <= 0 then raise exception 'Nenhum produto válido no pedido.'; end if;
  new_code := 'AZ' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

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
grant execute on function public.create_order(jsonb) to anon, authenticated;

create or replace view public.orders_with_items with (security_invoker=true) as
select o.*,coalesce(jsonb_agg(jsonb_build_object('productId',i.product_id,'name',i.name,'quantity',i.quantity,'unitPrice',i.unit_price,'subtotal',i.subtotal)) filter (where i.id is not null),'[]'::jsonb) items
from public.orders o left join public.order_items i on i.order_id=o.id group by o.id;

revoke all on public.orders_with_items from anon, authenticated;
grant select on public.orders_with_items to authenticated;

-- Segurança administrativa da Adega Zeus.
-- Execute depois de schema.sql e antes dos arquivos 02 a 14.
-- Este arquivo pode ser executado novamente sem ampliar permissões.
begin;

create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

revoke all on private.admin_users from public, anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from private.admin_users administrator
      where administrator.user_id = (select auth.uid())
    );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Produtos: visitantes veem somente itens disponíveis; administradores gerenciam tudo.
alter table public.products enable row level security;
revoke all on public.products from anon, authenticated;
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

drop policy if exists "catalogo publico" on public.products;
drop policy if exists "catalogo visitante" on public.products;
drop policy if exists "admin consulta catalogo" on public.products;
drop policy if exists "admin gerencia produtos" on public.products;

create policy "catalogo visitante"
on public.products for select to anon
using (available = true);

create policy "admin consulta catalogo"
on public.products for select to authenticated
using ((select public.is_admin()));

create policy "admin gerencia produtos"
on public.products for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- Pedidos: são criados pelo RPC público, mas somente administradores podem consultá-los ou alterá-los.
alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;
grant select, update on public.orders to authenticated;

drop policy if exists "admin consulta pedidos" on public.orders;
drop policy if exists "admin atualiza pedidos" on public.orders;

create policy "admin consulta pedidos"
on public.orders for select to authenticated
using ((select public.is_admin()));

create policy "admin atualiza pedidos"
on public.orders for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- Itens seguem a mesma proteção dos pedidos.
alter table public.order_items enable row level security;
revoke all on public.order_items from anon, authenticated;
grant select on public.order_items to authenticated;

drop policy if exists "admin consulta itens" on public.order_items;
create policy "admin consulta itens"
on public.order_items for select to authenticated
using ((select public.is_admin()));

commit;


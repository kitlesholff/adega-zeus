begin;
create table if not exists private.panel_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check(length(trim(display_name)) between 2 and 100),
  email text not null,
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table private.panel_operators enable row level security;
revoke all on private.panel_operators from public,anon,authenticated;

create or replace function public.can_operate()
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_admin() or exists(select 1 from private.panel_operators where user_id=(select auth.uid()) and active);
$$;
create or replace function public.panel_role()
returns text language sql stable security definer set search_path='' as $$
  select case when public.is_admin() then 'admin' when public.can_operate() then 'operator' else null end;
$$;
revoke all on function public.can_operate(),public.panel_role() from public,anon;
grant execute on function public.can_operate(),public.panel_role() to authenticated;

create or replace function public.list_panel_operators()
returns setof private.panel_operators language plpgsql security definer set search_path='' as $$
begin
  if public.is_admin() is not true then raise exception 'Acesso negado.' using errcode='42501'; end if;
  return query select * from private.panel_operators order by created_at desc;
end; $$;
create or replace function public.set_panel_operator_active(p_user_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if public.is_admin() is not true then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if p_active is null then raise exception 'Informe o estado do acesso.'; end if;
  if exists(select 1 from private.admin_users where user_id=p_user_id) then raise exception 'Administrador nao pode ser alterado por esta rotina.'; end if;
  update private.panel_operators set active=p_active where user_id=p_user_id;
  if not found then raise exception 'Operador nao encontrado.'; end if;
end; $$;
-- Somente a Edge Function pode vincular um novo usuario criado pela API Auth.
create or replace function public.register_panel_operator(p_user_id uuid,p_name text,p_email text,p_created_by uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if not exists(select 1 from private.admin_users where user_id=p_created_by) then raise exception 'Administrador invalido.'; end if;
  if exists(select 1 from private.admin_users where user_id=p_user_id) then raise exception 'Este usuario ja e administrador.'; end if;
  insert into private.panel_operators(user_id,display_name,email,created_by) values(p_user_id,trim(p_name),lower(trim(p_email)),p_created_by);
end; $$;
revoke all on function public.list_panel_operators(),public.set_panel_operator_active(uuid,boolean) from public,anon;
grant execute on function public.list_panel_operators(),public.set_panel_operator_active(uuid,boolean) to authenticated;
revoke all on function public.register_panel_operator(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.register_panel_operator(uuid,text,text,uuid) to service_role;

-- Operadores consultam os produtos para montar pedidos, mas nao os editam.
drop policy if exists "operador consulta produtos" on public.products;
create policy "operador consulta produtos" on public.products for select to authenticated using ((select public.can_operate()));
drop policy if exists "operador consulta categorias" on public.product_categories;
create policy "operador consulta categorias" on public.product_categories for select to authenticated using ((select public.can_operate()));
drop policy if exists "operador consulta pedidos" on public.orders;
create policy "operador consulta pedidos" on public.orders for select to authenticated using ((select public.can_operate()));
drop policy if exists "operador consulta itens" on public.order_items;
create policy "operador consulta itens" on public.order_items for select to authenticated using ((select public.can_operate()));
drop policy if exists "operador consulta despesas" on public.expenses;
create policy "operador consulta despesas" on public.expenses for select to authenticated using ((select public.can_operate()));

-- Amplia apenas as quatro rotinas operacionais; is_admin continua exclusivo do dono.
-- Preserva todos os calculos, bloqueios e validacoes das migracoes anteriores.
do $migration$
declare signature text; definition text;
begin
  foreach signature in array array['public.cash_register(text,jsonb)','public.cash_register_v2(text,jsonb)','public.set_order_status(uuid,text)','public.protect_confirmed_order()'] loop
    if to_regprocedure(signature) is null then raise exception 'Rotina obrigatoria ausente: %',signature; end if;
    definition := pg_get_functiondef(to_regprocedure(signature));
    if position('public.is_admin()' in definition)=0 and position('public.can_operate()' in definition)=0 then raise exception 'Protecao inesperada na rotina: %',signature; end if;
    execute replace(definition,'public.is_admin()','public.can_operate()');
  end loop;
end; $migration$;
revoke all on function public.cash_register_v2(text,jsonb),public.protect_confirmed_order() from public,anon,authenticated;
-- Operadores confirmam/cancelam apenas pelo RPC, sem edicao direta de pedidos.
commit;

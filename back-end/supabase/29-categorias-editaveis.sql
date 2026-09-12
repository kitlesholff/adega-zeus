-- Execute após 28-caixinhas-produtos-independentes.sql.
begin;
alter table public.product_categories add column if not exists system_key text unique;
insert into public.product_categories(name) select 'Caixinhas'
where not exists(select 1 from public.product_categories where system_key='boxes')
on conflict(name) do nothing;
update public.product_categories set system_key='boxes' where name='Caixinhas'
and not exists(select 1 from public.product_categories where system_key='boxes');

create or replace function public.protect_box_category()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.system_key='boxes' then
    if tg_op='DELETE' then raise exception 'A categoria de caixinhas não pode ser excluída.'; end if;
    if new.system_key is distinct from old.system_key then raise exception 'A proteção da categoria não pode ser removida.'; end if;
  end if;
  return coalesce(new,old);
end;
$$;
drop trigger if exists protect_box_category on public.product_categories;
create trigger protect_box_category before delete or update on public.product_categories
for each row execute function public.protect_box_category();

create or replace function public.rename_product_category(old_name text,new_name text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Acesso restrito ao administrador.'; end if;
  new_name:=trim(new_name);
  if new_name is null or length(new_name) not between 2 and 50 then raise exception 'O nome deve ter entre 2 e 50 caracteres.'; end if;
  if old_name=new_name then return; end if;
  if exists(select 1 from public.product_categories where lower(name)=lower(new_name)) then raise exception 'Esta categoria já existe.'; end if;
  update public.product_categories set name=new_name where name=old_name;
  if not found then raise exception 'Categoria não encontrada.'; end if;
  update public.products set category=new_name where category=old_name;
end;
$$;
revoke all on function public.rename_product_category(text,text) from public,anon;
grant execute on function public.rename_product_category(text,text) to authenticated;
revoke all on function public.protect_box_category() from public,anon,authenticated;
commit;

-- Execute no SQL Editor do projeto atual. Preserva produtos e pedidos.
begin;
alter table public.products add column if not exists kit_items jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists box_option jsonb;
alter table public.products add column if not exists parent_product_id text references public.products(id) on delete set null;
alter table public.products add column if not exists box_units integer check(box_units between 2 and 100);
alter table public.products add column if not exists sale_price numeric(10,2);
alter table public.products add column if not exists promotion_label text;
alter table public.products add column if not exists featured boolean not null default false;
alter table public.products add column if not exists product_type text not null default 'product' check(product_type in ('product','box','combo'));
update public.products set product_type='combo' where jsonb_array_length(kit_items)>0;
update public.products set product_type='box' where box_units is not null or parent_product_id is not null;
alter table public.product_categories add column if not exists system_key text unique;

create or replace function public.protect_box_category()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.system_key='boxes' then
    if tg_op='DELETE' then raise exception 'A categoria de fardos não pode ser excluída.'; end if;
    if new.system_key is distinct from old.system_key then raise exception 'A proteção da categoria não pode ser removida.'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists protect_box_category on public.product_categories;

-- Mescla os nomes antigos em uma única categoria protegida.
do $$
declare old_box text;
begin
  select name into old_box from public.product_categories where system_key='boxes';
  insert into public.product_categories(name) values('Fardo') on conflict(name) do nothing;
  update public.products set category='Fardo'
    where lower(trim(category)) in ('caixinha','caixinhas') or category=old_box;
  update public.products set name=regexp_replace(name,'^Caixinha de ','Fardo de ','i')
    where category='Fardo' and name ~* '^Caixinha de ';
  delete from public.product_categories where name<>'Fardo'
    and (lower(trim(name)) in ('caixinha','caixinhas') or system_key='boxes');
  update public.product_categories set system_key='boxes' where name='Fardo';
end;
$$;
create trigger protect_box_category before delete or update on public.product_categories
for each row execute function public.protect_box_category();

create or replace function public.rename_product_category(old_name text,new_name text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Acesso restrito ao administrador.'; end if;
  new_name:=trim(new_name);
  if new_name is null or length(new_name) not between 2 and 50 then raise exception 'O nome deve ter entre 2 e 50 caracteres.'; end if;
  if old_name=new_name then return; end if;
  lock table public.product_categories in share row exclusive mode;
  if exists(select 1 from public.product_categories where lower(name)=lower(new_name) and name<>old_name) then raise exception 'Esta categoria já existe.'; end if;
  update public.product_categories set name=new_name where name=old_name;
  if not found then raise exception 'Categoria não encontrada.'; end if;
  update public.products set category=new_name where category=old_name;
end;
$$;

-- A mesma tabela e os mesmos campos usados pelo cadastro manual.
-- IDs determinísticos garantem reexecução sem substituir edições do lojista.
create or replace function public.import_catalog_products(catalog jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare added integer; total integer; category_added integer; boxes_name text;
begin
  if not public.is_admin() then raise exception 'Acesso restrito ao administrador.'; end if;
  if catalog is null or jsonb_typeof(catalog)<>'array' then raise exception 'Catálogo inválido.'; end if;
  total:=jsonb_array_length(catalog);
  if total<1 or total>1000 then raise exception 'O catálogo deve conter de 1 a 1000 registros.'; end if;
  select name into boxes_name from public.product_categories where system_key='boxes';
  boxes_name:=coalesce(boxes_name,'Fardo');
  if exists(select 1 from jsonb_to_recordset(catalog) as p(id text,name text,category text,price numeric,image text)
    where p.id is null or p.id not like 'uairango-10999-%' or p.name is null or length(trim(p.name))=0
      or p.category is null or length(trim(p.category)) not between 2 and 50
      or p.price is null or p.price<0 or p.image is null or length(trim(p.image))=0)
  then raise exception 'Produto incompleto no catálogo.'; end if;
  insert into public.product_categories(name)
    select distinct case when p.category='Fardo' then boxes_name else p.category end
    from jsonb_to_recordset(catalog) as p(category text) on conflict(name) do nothing;
  get diagnostics category_added=row_count;
  insert into public.products(id,name,description,price,sale_price,promotion_label,category,image,available,featured,kit_items,box_option,box_units,parent_product_id,product_type)
    select p.id,p.name,coalesce(p.description,''),p.price,p.sale_price,p.promotion_label,
      case when p.category='Fardo' then boxes_name else p.category end,
      p.image,coalesce(p.available,true),coalesce(p.featured,false),coalesce(p.kit_items,'[]'::jsonb),null,p.box_units,p.parent_product_id,coalesce(p.product_type,'product')
    from jsonb_to_recordset(catalog) as p(id text,name text,description text,price numeric,sale_price numeric,promotion_label text,category text,image text,available boolean,featured boolean,kit_items jsonb,box_units integer,parent_product_id text,product_type text)
    on conflict(id) do nothing;
  get diagnostics added=row_count;
  return jsonb_build_object('inserted',added,'skipped',total-added,'categories',category_added);
end;
$$;
revoke all on function public.protect_box_category() from public,anon,authenticated;
revoke all on function public.rename_product_category(text,text) from public,anon;
grant execute on function public.rename_product_category(text,text) to authenticated;
revoke all on function public.import_catalog_products(jsonb) from public,anon;
grant execute on function public.import_catalog_products(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

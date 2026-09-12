-- Execute após 27-promocao-caixinha.sql. Converte caixinhas existentes em produtos.
begin;
alter table public.products add column if not exists parent_product_id text references public.products(id) on delete set null;
alter table public.products add column if not exists box_units integer check (box_units between 2 and 100);
insert into public.product_categories(name) values ('Caixinhas') on conflict do nothing;
insert into public.products(id,parent_product_id,box_units,name,description,category,price,sale_price,promotion_label,image,available)
select gen_random_uuid()::text,p.id,(p.box_option->>'units')::integer,
  'Caixinha de '||p.name||' ('||(p.box_option->>'units')||' un.)',p.description,'Caixinhas',
  (p.box_option->>'price')::numeric,(p.box_option->>'sale_price')::numeric,
  p.box_option->>'promotion_label',p.box_option->>'image',p.available
from public.products p where p.box_option is not null
and not exists(select 1 from public.products child where child.parent_product_id=p.id);
update public.products set box_option=null where box_option is not null;
commit;

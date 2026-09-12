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

-- Execute após 30-fardos-combos-importacao.sql. Importação dos itens permitidos da planilha.
begin;
insert into public.product_categories(name) values
('COPÃO 700ML'),
('CERVEJA LATA'),
('Fardo'),
('LONG NECK'),
('BALLENA'),
('DRINKS PRONTOS'),
('COMBOS'),
('Porções Zeus'),
('Isotônico'),
('MANSAO MAROMBA'),
('Isqueiros'),
('CHAMPANHE/ SIDRA/ ESPUMANTE'),
('Papéis e filtros'),
('DESTILADOS'),
('LICOR'),
('GIN'),
('VINHOS'),
('WISKHY'),
('CACHAÇA'),
('VODKA'),
('ENERGETICO'),
('GELO'),
('REFRIGERANTES, AGUA E SUCOS'),
('SALGADINHOS E DOCES'),
('RELACIONADO A TABACARIA'),
('HEAD SHOP')
on conflict(name) do nothing;
insert into public.products(id,name,description,price,sale_price,promotion_label,category,image,available,featured,kit_items,box_units,parent_product_id,product_type) values
('uairango-10999-3529147','ABSOLUT — Copão 700ml','',30,null,null,'COPÃO 700ML','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3529149','ABSOLUT COM RED BULL — Copão 700ml','',40,null,null,'COPÃO 700ML','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3605815','Bob Pinga — Copão 700ml','',20,null,null,'COPÃO 700ML','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3605791','Busca Brisa — Copão 700ml','',25,null,null,'COPÃO 700ML','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3529143','CAVALO BRANCO — Copão 700ml','',30,null,null,'COPÃO 700ML','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3529145','CAVALO BRANCO COM RED BULL — Copão 700ml','',35,null,null,'COPÃO 700ML','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3529131','GIN ETERNITY COCO E AÇAI — Copão 700ml','',15,null,null,'COPÃO 700ML','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3529129','GIN ETERNITY MAÇÃ VERDE — Copão 700ml','',15,null,null,'COPÃO 700ML','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3529123','GIN ETERNITY MELANCIA — Copão 700ml','',15,null,null,'COPÃO 700ML','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3529125','GIN ETERNITY TROPICAL — Copão 700ml','',15,null,null,'COPÃO 700ML','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3529135','MALIBU — Copão 700ml','',25,null,null,'COPÃO 700ML','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3529137','RED LABEL — Copão 700ml','',35,null,null,'COPÃO 700ML','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3529139','RED LABEL COM RED BULL — Copão 700ml','',40,null,null,'COPÃO 700ML','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3529151','SMIRNOFF — Copão 700ml','',25,null,null,'COPÃO 700ML','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3529153','SMIRNOFF COM RED BULL — Copão 700ml','',35,null,null,'COPÃO 700ML','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3477643','brahma chopp  lata 350ml','',5,null,null,'CERVEJA LATA','assets/catalogo/uairango-10999-3477643.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3518961','Eisenbahn 350ml','',5.5,null,null,'CERVEJA LATA','assets/catalogo/uairango-10999-3518961.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3440229','Heineken zero 350ml','',8,null,null,'CERVEJA LATA','assets/catalogo/uairango-10999-3440229.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3453573','Imperio Ultra 350ml (sem glutem)','',6,null,null,'CERVEJA LATA','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1233949','Lata Brahma Duplo Malte 350ml','',6.5,null,null,'CERVEJA LATA','assets/catalogo/uairango-10999-1233949.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1233951','Lata Budweiser 350ml','',6,null,null,'CERVEJA LATA','assets/catalogo/uairango-10999-1233951.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1233953','Lata Heineken 350ml','',6.5,null,null,'CERVEJA LATA','assets/catalogo/uairango-10999-1233953.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1233957','Lata Itaipava 350ml','',4,null,null,'CERVEJA LATA','assets/catalogo/uairango-10999-1233957.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1573177','Lata Original 350ml','',6,null,null,'CERVEJA LATA','assets/catalogo/uairango-10999-1573177.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1233961','Lata skol 350ml','',5,null,null,'CERVEJA LATA','assets/catalogo/uairango-10999-1233961.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1573163','Fardo Brahma 350ml','12 unid',55,null,null,'Fardo','assets/catalogo/uairango-10999-1573163.png',true,false,'[]'::jsonb,12,'uairango-10999-3477643','box'),
('uairango-10999-2819883','fardo brahma duplo malte 350ml','',65,null,null,'Fardo','assets/catalogo/uairango-10999-2819883.png',true,false,'[]'::jsonb,null,'uairango-10999-1233949','box'),
('uairango-10999-1235563','Fardo Budweiser','',60,null,null,'Fardo','assets/catalogo/uairango-10999-1235563.png',true,false,'[]'::jsonb,null,null,'box'),
('uairango-10999-3518959','FARDO Eisenbahn 350ml','',60,50,'Promoção','Fardo','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,'uairango-10999-3518961','box'),
('uairango-10999-1235593','Fardo Itaipava','',40,null,null,'Fardo','assets/catalogo/uairango-10999-1235593.png',true,false,'[]'::jsonb,null,null,'box'),
('uairango-10999-1573173','Fardo Original 350ml','12 unid',63,null,null,'Fardo','assets/catalogo/uairango-10999-1573173.png',true,false,'[]'::jsonb,12,'uairango-10999-1573177','box'),
('uairango-10999-1554465','fardo skol 269ml 15 unid','',54,null,null,'Fardo','assets/catalogo/uairango-10999-1554465.png',true,false,'[]'::jsonb,15,null,'box'),
('uairango-10999-1235601','fardo skol 350ml','12 unidades',52,null,null,'Fardo','assets/catalogo/uairango-10999-1235601.png',true,false,'[]'::jsonb,12,'uairango-10999-1233961','box'),
('uairango-10999-3000481','fardo skol 350ml com 18 unidades','',72,null,null,'Fardo','assets/catalogo/uairango-10999-3000481.png',true,false,'[]'::jsonb,18,'uairango-10999-1233961','box'),
('uairango-10999-3062381','Amstel de long neck 355ml','',8,null,null,'LONG NECK','assets/catalogo/uairango-10999-3062381.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3523109','Cerveja PRAYA','',9,null,null,'LONG NECK','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3518977','Eisenbahn 355ml','',8,null,null,'LONG NECK','assets/catalogo/uairango-10999-3518977.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3285923','ice smirnoff','',12,null,null,'LONG NECK','assets/catalogo/uairango-10999-3285923.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3595959','Imperio Larger verde puro malt','',7,null,null,'LONG NECK','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3595957','Imperio Ultra 275ml (sem glutem)','',6,null,null,'LONG NECK','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1236419','Long neck Budweiser','',8.5,null,null,'LONG NECK','assets/catalogo/uairango-10999-1236419.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1236429','Long neck Heineken','',9,null,null,'LONG NECK','assets/catalogo/uairango-10999-1236429.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1236421','Stella Artois','',12,null,null,'LONG NECK','assets/catalogo/uairango-10999-1236421.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3613929','Stella Artois Pure Gold (Sem Glutem)','',13,null,null,'LONG NECK','assets/catalogo/uairango-10999-3613929.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3529167','BALENNA DE COCO','',190,null,null,'BALLENA','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3529165','BALENNA DE MORANGO','',190,null,null,'BALLENA','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1238929','Cabare Ice Limao long neck','',9,null,null,'DRINKS PRONTOS','assets/catalogo/uairango-10999-1238929.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3529109','Copo de Gin Eternity Melancia','',15,null,null,'DRINKS PRONTOS','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2376835','ice leev limao','',9,null,null,'DRINKS PRONTOS','assets/catalogo/uairango-10999-2376835.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3377701','Ice leev maçã verde','',9,null,null,'DRINKS PRONTOS','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2815981','ice leev maracuja','',9,null,null,'DRINKS PRONTOS','assets/catalogo/uairango-10999-2815981.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3595963','ice leev melancia','',9,null,null,'DRINKS PRONTOS','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2376833','ice leev morango','',9,null,null,'DRINKS PRONTOS','assets/catalogo/uairango-10999-2376833.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3529003','Jack And Coke','',10,null,null,'DRINKS PRONTOS','assets/catalogo/uairango-10999-3529003.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3408125','Mix para drink morango (coco leve)  200ml','',12,null,null,'DRINKS PRONTOS','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3595967','Ready gin Melancia','',9,null,null,'DRINKS PRONTOS','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3595969','Ready gin tonica','',9,null,null,'DRINKS PRONTOS','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3595965','Redady Gin Melancia','',9,null,null,'DRINKS PRONTOS','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1360997','Skol Beats GT Long Neck','',12,null,null,'DRINKS PRONTOS','assets/catalogo/uairango-10999-1360997.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1360995','skol Beats long neck','',12,null,null,'DRINKS PRONTOS','assets/catalogo/uairango-10999-1360995.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3507869','Skol Beats Tropical Long Neck','',12,null,null,'DRINKS PRONTOS','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3113403','Skol Beats, frutas vermelhas Long neck','',12,null,null,'DRINKS PRONTOS','assets/catalogo/uairango-10999-3113403.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2339815','sminorf ice long neck','',12,null,null,'DRINKS PRONTOS','assets/catalogo/uairango-10999-2339815.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3664206','Xeque Mate','',13,null,null,'DRINKS PRONTOS','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3073981','Gin Tanqueray + Red bull 250ml + Gelo (sabor não informado) + Copos','acompanha 4 red bull 4 gelo 4 copo',200,null,null,'COMBOS','assets/product-image-pending.svg',true,false,'[{"productId":"uairango-10999-1549869","name":"Gin Tanqueray","quantity":1},{"productId":"uairango-10999-1236461","name":"Red bull 250ml","quantity":4},{"productId":null,"name":"Gelo (sabor não informado)","quantity":4},{"productId":null,"name":"Copos","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-3231171','combo Jim Beam Honey','',190,null,null,'COMBOS','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'combo'),
('uairango-10999-3707904','Bob Pinga + Monster Mango loco + Gelo Skol Beats Tropical + Copos','1 Garrafa de Bb Pinga. 3 Monster Mago loco, 4 gelos skol Beats (tropical), 4 Copos',125,null,null,'COMBOS','assets/product-image-pending.svg',true,false,'[{"productId":"uairango-10999-3605819","name":"Bob Pinga","quantity":1},{"productId":"uairango-10999-1822945","name":"Monster Mango loco","quantity":3},{"productId":null,"name":"Gelo Skol Beats Tropical","quantity":4},{"productId":null,"name":"Copos","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-3707898','Busca Brisa + Energético baly coco/açai + Gelo de coco + Copos','1 Garrafa de Busca Brisa, 4 gelos de coco, 1 Bally 2L Coco e Açai e 4 copos',90,null,null,'COMBOS','assets/product-image-pending.svg',true,false,'[{"productId":"uairango-10999-3605817","name":"Busca Brisa","quantity":1},{"productId":"uairango-10999-3285957","name":"Energético baly coco/açai","quantity":1},{"productId":"uairango-10999-1238789","name":"Gelo de coco","quantity":4},{"productId":null,"name":"Copos","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-3707902','Busca Brisa + Monster ultra + Gelo de coco + Copos','1 Garrafa de Busca Brisa, 3 Monster Ultra, 4 Gelos de coco e 4 Copos',125,null,null,'COMBOS','assets/product-image-pending.svg',true,false,'[{"productId":"uairango-10999-3605817","name":"Busca Brisa","quantity":1},{"productId":"uairango-10999-1236465","name":"Monster ultra","quantity":3},{"productId":"uairango-10999-1238789","name":"Gelo de coco","quantity":4},{"productId":null,"name":"Copos","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-1273997','Ballantaimes + Energético de sabor + Gelo (sabor não informado)','Acompanha energeticode sabor+4 gelos',130,null,null,'COMBOS','assets/catalogo/uairango-10999-1273997.png',true,false,'[{"productId":"uairango-10999-3130571","name":"Ballantaimes","quantity":1},{"productId":null,"name":"Energético de sabor","quantity":null},{"productId":null,"name":"Gelo (sabor não informado)","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-1722749','Buchanans Deluxe + Red bull 250ml + Gelo (sabor não informado)','acompanha 4 redbull e 4 gelo',310,null,null,'COMBOS','assets/catalogo/uairango-10999-1722749.png',true,false,'[{"productId":"uairango-10999-1722503","name":"Buchanans Deluxe","quantity":1},{"productId":"uairango-10999-1236461","name":"Red bull 250ml","quantity":4},{"productId":null,"name":"Gelo (sabor não informado)","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-568627','White Horse 1L + Energético Fluxo + Gelo de coco ou maracujá','Acompanha energético fluxo + 4 gelo de coco ou maracujá',130,null,null,'COMBOS','assets/catalogo/uairango-10999-568627.png',true,false,'[{"productId":"uairango-10999-1236477","name":"White Horse 1L","quantity":1},{"productId":null,"name":"Energético Fluxo","quantity":null},{"productId":null,"name":"Gelo de coco ou maracujá","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-1722819','chivas regal 12 anos 1L + Red bull 250ml + Gelo (sabor não informado)','acompanha 4 gelo e 4 redbul',280,null,null,'COMBOS','assets/catalogo/uairango-10999-1722819.png',true,false,'[{"productId":"uairango-10999-1722787","name":"chivas regal 12 anos 1L","quantity":1},{"productId":"uairango-10999-1236461","name":"Red bull 250ml","quantity":4},{"productId":null,"name":"Gelo (sabor não informado)","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-2160131','Beefeater pink + Red bull 250ml + Gelo (sabor não informado)','acompanha 4 redbull e 4 gelo',190,null,null,'COMBOS','assets/product-image-pending.svg',true,false,'[{"productId":"uairango-10999-2565331","name":"Beefeater pink","quantity":1},{"productId":"uairango-10999-1236461","name":"Red bull 250ml","quantity":4},{"productId":null,"name":"Gelo (sabor não informado)","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-3093281','Beefeater Tradicional + Red bull 250ml + Gelo de coco','acompanha 4 gelo de coco , 4 red bull',170,null,null,'COMBOS','assets/product-image-pending.svg',true,false,'[{"productId":"uairango-10999-3093265","name":"Beefeater Tradicional","quantity":1},{"productId":"uairango-10999-1236461","name":"Red bull 250ml","quantity":4},{"productId":"uairango-10999-1238789","name":"Gelo de coco","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-3407403','Gin Eternity coco/açai + Energético 2L + Gelo de coco + Copos','Acompanha , 4 gelos de coco , 4 copos 500m, 1 garrafa de gin, 1 garrafa de energetico 2 litros',65,null,null,'COMBOS','assets/product-image-pending.svg',true,false,'[{"productId":"uairango-10999-3285865","name":"Gin Eternity coco/açai","quantity":1},{"productId":null,"name":"Energético 2L","quantity":1},{"productId":"uairango-10999-1238789","name":"Gelo de coco","quantity":4},{"productId":null,"name":"Copos","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-3407401','Gin eternity maça verde + Energético 2L + Gelo de Maça Verde + Copos 500ml','Acompanha 4 gelos de maça verde, 4 copos 500 ml , uma garrafa de gin, uma garrafa de energetico 2 litros',65,null,null,'COMBOS','assets/product-image-pending.svg',true,false,'[{"productId":"uairango-10999-1681527","name":"Gin eternity maça verde","quantity":1},{"productId":null,"name":"Energético 2L","quantity":1},{"productId":"uairango-10999-1297873","name":"Gelo de Maça Verde","quantity":4},{"productId":null,"name":"Copos 500ml","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-3407399','gin eternity melancia + Energético 2L + Gelo melancia + Copos 500ml','Acompanha 4 gelos de melancia, 4 copos 500 ml , um garrafa de gin, um garrafa de energetico 2litros',65,null,null,'COMBOS','assets/product-image-pending.svg',true,false,'[{"productId":"uairango-10999-2565337","name":"gin eternity melancia","quantity":1},{"productId":null,"name":"Energético 2L","quantity":1},{"productId":"uairango-10999-1844095","name":"Gelo melancia","quantity":4},{"productId":null,"name":"Copos 500ml","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-1233935','Jack Daniels + Red bull 250ml + Gelo (sabor não informado)','ACOMPANHA 4 GELO E 4 RED BULL',250,null,null,'COMBOS','assets/product-image-pending.svg',true,false,'[{"productId":"uairango-10999-1236481","name":"Jack Daniels","quantity":1},{"productId":"uairango-10999-1236461","name":"Red bull 250ml","quantity":4},{"productId":null,"name":"Gelo (sabor não informado)","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-2565329','Jack Daniels Blackberry + Red bull 250ml + Gelo (sabor não informado)','acompanha 4 redbull, 4 gelo',290,null,null,'COMBOS','assets/product-image-pending.svg',true,false,'[{"productId":null,"name":"Jack Daniels Blackberry","quantity":1},{"productId":"uairango-10999-1236461","name":"Red bull 250ml","quantity":4},{"productId":null,"name":"Gelo (sabor não informado)","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-2095265','Jack Daniels Honey + Red bull 250ml + Gelo (sabor não informado)','4 REDBULL 4 GELO',250,null,null,'COMBOS','assets/product-image-pending.svg',true,false,'[{"productId":null,"name":"Jack Daniels Honey","quantity":1},{"productId":"uairango-10999-1236461","name":"Red bull 250ml","quantity":4},{"productId":null,"name":"Gelo (sabor não informado)","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-1233939','Jack Daniels Apple + Red bull 250ml + Gelo de coco','ACOMPANHA 4 GELO DE COCO E 4 RED BULL',250,null,null,'COMBOS','assets/catalogo/uairango-10999-1233939.png',true,false,'[{"productId":"uairango-10999-1239265","name":"Jack Daniels Apple","quantity":1},{"productId":"uairango-10999-1236461","name":"Red bull 250ml","quantity":4},{"productId":"uairango-10999-1238789","name":"Gelo de coco","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-3231181','combo jim beam','',190,null,null,'COMBOS','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'combo'),
('uairango-10999-1722045','master gold + Energético 2L + Gelo (sabor não informado)','acompanha 4 gelo e o energetico 2l',60,null,null,'COMBOS','assets/catalogo/uairango-10999-1722045.png',true,false,'[{"productId":"uairango-10999-3211649","name":"master gold","quantity":1},{"productId":null,"name":"Energético 2L","quantity":null},{"productId":null,"name":"Gelo (sabor não informado)","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-568637','Red label + Red bull 250ml + Gelo de coco ou maracujá','Acompanha energético red bull+ 4  gelo de coco ou maracujá',190,null,null,'COMBOS','assets/product-image-pending.svg',true,false,'[{"productId":"uairango-10999-1236479","name":"Red label","quantity":1},{"productId":"uairango-10999-1236461","name":"Red bull 250ml","quantity":null},{"productId":null,"name":"Gelo de coco ou maracujá","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-568635','Vodka Sminorff + Energético + Gelo de coco ou maracujá','Acompanha energético + 4 gelo de coco ou maracujá',90,null,null,'COMBOS','assets/catalogo/uairango-10999-568635.png',true,false,'[{"productId":"uairango-10999-1326707","name":"Vodka Sminorff","quantity":1},{"productId":null,"name":"Energético","quantity":null},{"productId":null,"name":"Gelo de coco ou maracujá","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-3244909','Gin eternity maça verde + Energético 2L + Gelo de Maça Verde + Copos','garrafa de gin, 4 copos, energético 2l, e 4 gelos do sabor da garrafa',65,null,null,'COMBOS','assets/product-image-pending.svg',true,false,'[{"productId":"uairango-10999-1681527","name":"Gin eternity maça verde","quantity":1},{"productId":null,"name":"Energético 2L","quantity":1},{"productId":"uairango-10999-1297873","name":"Gelo de Maça Verde","quantity":4},{"productId":null,"name":"Copos","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-3244907','Gin eternity maça verde + Energético 2L + Gelo de Maça Verde + Copos','garrafa de gin, 4 copos, energético 2l, e 4 gelos do sabor da garrafa',65,null,null,'COMBOS','assets/product-image-pending.svg',true,false,'[{"productId":"uairango-10999-1681527","name":"Gin eternity maça verde","quantity":1},{"productId":null,"name":"Energético 2L","quantity":1},{"productId":"uairango-10999-1297873","name":"Gelo de Maça Verde","quantity":4},{"productId":null,"name":"Copos","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-3671966','OldParr + Red bull 250ml + Gelo de coco + Copos','garrafa de oldParr, 4 redbull, 4 gelo de côco e 4 copos',280,null,null,'COMBOS','assets/product-image-pending.svg',true,false,'[{"productId":"uairango-10999-3671962","name":"OldParr","quantity":1},{"productId":"uairango-10999-1236461","name":"Red bull 250ml","quantity":4},{"productId":"uairango-10999-1238789","name":"Gelo de coco","quantity":4},{"productId":null,"name":"Copos","quantity":4}]'::jsonb,null,null,'combo'),
('uairango-10999-3434307','Contra Acebolado','Contra filé com cebola',65,null,null,'Porções Zeus','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3434309','Nuggets','',49,null,null,'Porções Zeus','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3507879','Gatorade Frutas Citricas 500ml','',8,null,null,'Isotônico','assets/catalogo/uairango-10999-3507879.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3507885','Gatorade Laranja 500 ml','',8,null,null,'Isotônico','assets/catalogo/uairango-10999-3507885.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3507873','Gatorade Uva 500ml','',8,null,null,'Isotônico','assets/catalogo/uairango-10999-3507873.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3507883','Gatorade Zero 350ml','',7,null,null,'Isotônico','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3559833','Powerade ATAQUE PET 500ml','',7,null,null,'Isotônico','assets/catalogo/uairango-10999-3559833.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3559829','Powerade frutas tropicais 500ml','',7,null,null,'Isotônico','assets/catalogo/uairango-10999-3559829.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3559835','Powerade LARANJA 500ml','',7,null,null,'Isotônico','assets/catalogo/uairango-10999-3559835.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3559837','Powerade LIMÃO 500ml','',7,null,null,'Isotônico','assets/catalogo/uairango-10999-3559837.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3559831','Powerade MOUNTAIN BLAST 500ml','',7,null,null,'Isotônico','assets/catalogo/uairango-10999-3559831.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3559839','Powerade TANGERINA 500ml','',7,null,null,'Isotônico','assets/catalogo/uairango-10999-3559839.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3559843','Powerade UVA 500ml','',7,null,null,'Isotônico','assets/catalogo/uairango-10999-3559843.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3559841','Powerade ZERO MOUNT BLAST 500ml','',7,null,null,'Isotônico','assets/catalogo/uairango-10999-3559841.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3475631-vodka','MANSAO MAROMBA — Vodka','',20,null,null,'MANSAO MAROMBA','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3475631-tropical','MANSAO MAROMBA — Tropical','',20,null,null,'MANSAO MAROMBA','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3475631-whisk','MANSAO MAROMBA — Whisk','',20,null,null,'MANSAO MAROMBA','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3475631-melancia','MANSAO MAROMBA — Melancia','',20,null,null,'MANSAO MAROMBA','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1273439','Isqueiro Bic Grande','',8,null,null,'Isqueiros','assets/catalogo/uairango-10999-1273439.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1273437','Isqueiro Bic Pequeno','',6,null,null,'Isqueiros','assets/catalogo/uairango-10999-1273437.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2896619','celebrate','',25,null,null,'CHAMPANHE/ SIDRA/ ESPUMANTE','assets/catalogo/uairango-10999-2896619.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1500421','Papel em palha flor do norte','',4.5,null,null,'Papéis e filtros','assets/catalogo/uairango-10999-1500421.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2565199','papel juriti 50 folhas','',3.5,null,null,'Papéis e filtros','assets/catalogo/uairango-10999-2565199.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2565219','papel trevo','',4.5,null,null,'Papéis e filtros','assets/catalogo/uairango-10999-2565219.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3605819','Bob Pinga','',50,null,null,'DESTILADOS','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3605817','Busca Brisa','',60,null,null,'DESTILADOS','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-953557','Campari','',75,null,null,'DESTILADOS','assets/catalogo/uairango-10999-953557.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-568739','Canelinha','',40,null,null,'DESTILADOS','assets/catalogo/uairango-10999-568739.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3337863','Canelinha DA Rocha 275ml','',12,null,null,'DESTILADOS','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2118163','dreher','',35,null,null,'DESTILADOS','assets/catalogo/uairango-10999-2118163.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-953409','Jurupinga','',40,null,null,'DESTILADOS','assets/catalogo/uairango-10999-953409.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1605341','Malibu','',75,null,null,'DESTILADOS','assets/catalogo/uairango-10999-1605341.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3209099','tequila jose cuervo prata','',100,null,null,'DESTILADOS','assets/catalogo/uairango-10999-3209099.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1239259','Tequila tequiloko','',38,null,null,'DESTILADOS','assets/catalogo/uairango-10999-1239259.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1605335','amarula','',160,null,null,'LICOR','assets/catalogo/uairango-10999-1605335.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2160159','ballena','creme de morango com tequila',190,null,null,'LICOR','assets/catalogo/uairango-10999-2160159.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3078107','ballena de coco','',190,null,null,'LICOR','assets/catalogo/uairango-10999-3078107.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1605333','Licor 43','',200,null,null,'LICOR','assets/catalogo/uairango-10999-1605333.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1681527','Gin eternity maça verde','',40,null,null,'GIN','assets/catalogo/uairango-10999-1681527.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3093265','Beefeater Tradicional','',110,null,null,'GIN','assets/catalogo/uairango-10999-3093265.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2565331','Beefeater pink','',120,null,null,'GIN','assets/catalogo/uairango-10999-2565331.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3285865','Gin Eternity coco/açai','',40,null,null,'GIN','assets/catalogo/uairango-10999-3285865.webp',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1361159','Gin Eternity frutas tropicais','',40,null,null,'GIN','assets/catalogo/uairango-10999-1361159.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2565337','gin eternity melancia','',40,null,null,'GIN','assets/catalogo/uairango-10999-2565337.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1549869','Gin Tanqueray','',160,null,null,'GIN','assets/catalogo/uairango-10999-1549869.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3700240','Tanqueray Sevilla','',180,null,null,'GIN','assets/catalogo/uairango-10999-3700240.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3619551','Chardonay Chileno','',45,null,null,'VINHOS','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3619557','Chardonay Chileno, Vinho branco','',45,null,null,'VINHOS','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1238821','Pergola suave','',34,null,null,'VINHOS','assets/catalogo/uairango-10999-1238821.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3130571','Ballantaimes','',100,null,null,'WISKHY','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3221633','Ballantaimes Sunshine (abacaxi)','',100,null,null,'WISKHY','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1722503','Buchanans Deluxe','',210,null,null,'WISKHY','assets/catalogo/uairango-10999-1722503.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1722787','chivas regal 12 anos 1L','',200,null,null,'WISKHY','assets/catalogo/uairango-10999-1722787.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1236481','Jack Daniels','',190,null,null,'WISKHY','assets/catalogo/uairango-10999-1236481.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1239265','Jack Daniels Apple','',200,null,null,'WISKHY','assets/catalogo/uairango-10999-1239265.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3231153','Jim Beam Honey','',145,null,null,'WISKHY','assets/catalogo/uairango-10999-3231153.jpg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3231117','Jim Beam tradicional','',145,null,null,'WISKHY','assets/catalogo/uairango-10999-3231117.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3211649','master gold','',30,null,null,'WISKHY','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3671962','OldParr','',180,null,null,'WISKHY','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1236479','Red label','',110,null,null,'WISKHY','assets/catalogo/uairango-10999-1236479.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1236477','White Horse 1L','',100,null,null,'WISKHY','assets/catalogo/uairango-10999-1236477.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3061367','cachaça  carreirinho','Banana, coco, mel, artesanal',27,null,null,'CACHAÇA','assets/catalogo/uairango-10999-3061367.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1236447','Cachaça 51','',30,null,null,'CACHAÇA','assets/catalogo/uairango-10999-1236447.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3539047','Pitu Banana','',10,null,null,'CACHAÇA','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3408147','Pitu de caju 350 ml','',10,null,null,'CACHAÇA','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1236451','Pitu lata 350ml','',10,null,null,'CACHAÇA','assets/catalogo/uairango-10999-1236451.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1236455','Pitu Limao 350ml','',10,null,null,'CACHAÇA','assets/catalogo/uairango-10999-1236455.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2118117','pitu mel e limao 350ml','',10,null,null,'CACHAÇA','assets/catalogo/uairango-10999-2118117.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1236449','Velho Barreiro','',35,null,null,'CACHAÇA','assets/catalogo/uairango-10999-1236449.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1722333','Vodka Absolut 1L','',100,null,null,'VODKA','assets/catalogo/uairango-10999-1722333.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1326707','Vodka Sminorff','',65,null,null,'VODKA','assets/catalogo/uairango-10999-1326707.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2521557','baly maça verde','',15,null,null,'ENERGETICO','assets/catalogo/uairango-10999-2521557.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1367939','baly melancia 2L','',15,null,null,'ENERGETICO','assets/catalogo/uairango-10999-1367939.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2521559','baly morango e  pesssego','',15,null,null,'ENERGETICO','assets/catalogo/uairango-10999-2521559.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3286161','BALY Tradicional 2L','',15,null,null,'ENERGETICO','assets/catalogo/uairango-10999-3286161.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2521555','baly tropical','',15,null,null,'ENERGETICO','assets/catalogo/uairango-10999-2521555.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3285957','Energético baly coco/açai','',15,null,null,'ENERGETICO','assets/catalogo/uairango-10999-3285957.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3309633','monster energy 473ml tradicional','',12,null,null,'ENERGETICO','assets/catalogo/uairango-10999-3309633.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1822947','Monster energy zero','',12,null,null,'ENERGETICO','assets/catalogo/uairango-10999-1822947.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1822945','Monster Mango loco','',12,null,null,'ENERGETICO','assets/catalogo/uairango-10999-1822945.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3507857','Monster Mango loco Zero','',12,null,null,'ENERGETICO','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3093245','Monster pêssego','',12,null,null,'ENERGETICO','assets/catalogo/uairango-10999-3093245.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2354071','monster pipeline punch','',12,null,null,'ENERGETICO','assets/catalogo/uairango-10999-2354071.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1236463','Monster preto','',12,null,null,'ENERGETICO','assets/catalogo/uairango-10999-1236463.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1236469','Monster Rio Punch','',12,null,null,'ENERGETICO','assets/catalogo/uairango-10999-1236469.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3479097','Monster Strambery dream','',12,null,null,'ENERGETICO','assets/catalogo/uairango-10999-3479097.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1236465','Monster ultra','',12,null,null,'ENERGETICO','assets/catalogo/uairango-10999-1236465.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1236467','Monster ultra Violet','',12,null,null,'ENERGETICO','assets/catalogo/uairango-10999-1236467.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2354067','monster ultra watermelon','',12,null,null,'ENERGETICO','assets/catalogo/uairango-10999-2354067.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1236461','Red bull 250ml','',13,null,null,'ENERGETICO','assets/catalogo/uairango-10999-1236461.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3040121','Red bull Nectarina 250 ml','',13,null,null,'ENERGETICO','assets/catalogo/uairango-10999-3040121.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2333595','Gelo Abacaxi Cavalo branco','',5,null,null,'GELO','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1238789','Gelo de coco','',5,null,null,'GELO','assets/catalogo/uairango-10999-1238789.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1297873','Gelo de Maça Verde','',5,null,null,'GELO','assets/catalogo/uairango-10999-1297873.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1260725','Gelo em cubo 5kg','',14,null,null,'GELO','assets/catalogo/uairango-10999-1260725.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1238793','Gelo Maracuja','',5,null,null,'GELO','assets/catalogo/uairango-10999-1238793.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1844095','Gelo melancia','',5,null,null,'GELO','assets/catalogo/uairango-10999-1844095.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2819891','Coca Cola zero  350ml lata','',6,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-2819891.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1240595','Agua 500ml','',3.5,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-1240595.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1907185','agua com gas 500ml','',4,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-1907185.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1239269','Coca cola 2l','.',15,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-1239269.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2819889','Coca cola 2l zero','',15,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-2819889.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1239275','Coca cola 600ml','',9,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-1239275.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1239273','Coca cola lata  350ml','',6,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-1239273.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3300237','coca cola lata 220 ml','',3.5,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-3300237.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3300239','coca cola lata zero 220ml','',3.5,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-3300239.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1239309','Coca cola pet 200ml','',3,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-1239309.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3047679','Coca cola pet zero 200ml','',3,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-3047679.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1239277','Coca cola retornável','',11,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-1239277.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2815979','Coca cola retornável zero','',11,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-2815979.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3093273','Del vale caixa de 1l','sabores: laranja, uva ou maracuja, uva ligh, abacaxi, manga com morango ou abacaxi com tangerina?',12,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-3093273.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3310323','Del Valle 1,5','laranja, limão e uva',12,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1239295','Fanta laranja 2L','',12,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-1239295.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3281327','Fanta Laranja 600ml','',7,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-3281327.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1239297','Fanta laranja lata 350m','',6,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-1239297.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3521327','Fanta Maracuja 350 ml','',6,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-3521327.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3507935','Fanta Uva 220ml','',3.5,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-3507935.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1239301','Fanta uva 2L','.',12,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-1239301.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1239303','Fanta uva lata 350ml','',6,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-1239303.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3281607','KAPO','Abacaxi, Maracujá, Laranja, Uva, morango, maça',4,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3299887','kuat 2l','',12,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-3299887.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3370383','Powerade MOUNTAIN BLAST 500ml','',7,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-3370383.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1907997','schweppes citrus lata 350ml','',6.5,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-1907997.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1239311','Sprite 2l','',12,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-1239311.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3300243','sprite lata 220ml','',3.5,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-3300243.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1239313','Sprite Lata 350ml','',6,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-1239313.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1907181','Suco del vale lata 290ml','sabores disponivel : goiaba, uva, laranja, manga, pessego, limonada tropical, pink limonade, maracuja',8,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-1907181.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2971117','toddynho achocolatado','',4,null,null,'REFRIGERANTES, AGUA E SUCOS','assets/catalogo/uairango-10999-2971117.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1240645','Salgadinho Cheetos grande','Sabores disponiveis:  Lua, mix de queijo.

( informar o sabor em observação)',17,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-1240645.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1240643','Salgadinho Fandangos grande 85g','sabores disponível: presunto e queijo',15,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-1240643.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3274345','amendoim salgado kaçulinha','sabores: alho e bacon',3.5,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1240631','Amendoin Japones','',10,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-1240631.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1240633','Amendoin Ovinho','',9.5,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-1240633.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3406827','Baconzitos 86 g','',15,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3406827.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3279399','bala lua cheia','Baunilha, chocolate , brigadeiro, choc branco',0.2,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3362239','bala yogurte','',0.2,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1681307','Biscoito Passatempo morango','',5,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-1681307.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3456671','Cajuzinho','',4,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3406817','Cheetos assado  parmesão 80g','',17,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3406817.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3406821','Cheetos assado mix de queijos 70 g','',17,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3406821.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3406773','Cheetos assado parmesão 40g','',5,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3406773.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3092453','Cheetos assado requeijao 39g','uva, laranja',5,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3406791','Cheetos queijo suíço 37g','',5,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3406791.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3406783','Cheetos requeijão 160 g','',28,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3406783.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3406813','Cheetos requeijão 90 g','',15,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3406813.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-568811','Chiclete Crooc Buzzy','uva,morango,7 belo, hortalã',0.6,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-568811.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2563717','doritos 75g','',18,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-2563717.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3479073','Doritos Dinamita Flamin Hot 60g','',8,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3479073.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3479077','Doritos Dinamita Pimenta Mex. 60g','',8,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3479077.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3567541','Doritos Sweet Chili','',6,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3406829','Fandangos  sabor presunto 160','',27,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3406829.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3635753','Fandangos de churrasco 37g','',6,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3406901','Fandangos de queijo 37g','',5,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3406901.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3406835','Fandangos sabor queijo 85g','',13,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3406835.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3528965','Fini Bananas 15g','',5,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3528983','Fini Marsh Torção Pacote Grande','',15,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3528957','Fini Tubes Morango 15g','',4,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3528969','Fini Tubes Tutti Frutti 15g','',5,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-568777','Fofura','sabores disponiveis : churrasco, cebola, presunto

(informar em observação o sabor)',6,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-568777.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3406897','Fofura churrasco 60g','',6,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3406897.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3406895','Fofura presunto 60g','',6,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3406895.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3528933','Fruitella Morango Vita Goma','',7,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3528937','Frutella Morrango Bala','',7,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1240617','Halls','sabores disponiveis: , extra forte , melancia, menta , cereja, maça verde, morango ,

(informar o sabor em observação)',4,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-1240617.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3479069','Lays Sal e Vinagre','',15,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3519449','Lays sour cream','',15,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3519449.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3479067','Lays tradicional','',15,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3528939','Mentos Frutas Vermelhas','',4,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3528939.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3528917','Mentos Pure fruit 3 camadas','',5.5,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3528927','Mentos Rainbow Stick','',4,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3528927.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3528985','Mentos Salada de fruta','',4,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3274337','paçocão','',3.5,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3274335','pe de moça','',3.5,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3274333','pe de moleke','',3.5,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1240621','Pirulito','',1.5,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3103921','Pirulito','morango ou melancia',2,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1240659','Ruffles 32g','sabores disponiveis: churrasco, original, cebola e salsa.

informar o sabor em observação',6,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-1240659.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3406871','Ruffles cebola e salsa 32 g','',6,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3406871.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3406927','Ruffles cebola e salsa 68g','',12,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3406927.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3406875','Ruffles churrasco 32g','',6,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3406875.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3406867','Ruffles original 32g','',6,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3406867.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1240663','Ruffles Original grande 115 g','',24,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-1240663.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3519469','Senações peito de peru 70g','',15,null,null,'SALGADINHOS E DOCES','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3406839','Sensações frango grelhado 40g','',8.5,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3406839.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3519463','Sensações frango grelhado 70g','',15,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3519463.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1240635','Torcida','sabbores disponiveis: , queijo,cebola, , costelinha com limao, churrasco, pimenta mexicana, camarão',5,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-1240635.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3403563','Torcida bacon 35g','',4,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3403563.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3403567','Torcida costelinha com limão 35g','',4,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3403567.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3165003','Torcida de Pimenta','',4,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3165003.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3403571','Torcida queijo 35g','',4.5,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3403571.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3403615','trakinas chocolate','',5,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3403615.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3403605','Trakinas Morango','',5,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-3403605.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-2074967','trident','sabores disponivel, menta, melancia, hortela , morango, tutti frutti',4.5,null,null,'SALGADINHOS E DOCES','assets/catalogo/uairango-10999-2074967.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3075645','Borracha mangueira','',3.5,null,null,'RELACIONADO A TABACARIA','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3075647','Borracha Rosh','',4.5,null,null,'RELACIONADO A TABACARIA','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3075649','Borracha Vaso','',5.5,null,null,'RELACIONADO A TABACARIA','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1240719','Papel Aluminio 50 Folhas','',40,null,null,'RELACIONADO A TABACARIA','assets/catalogo/uairango-10999-1240719.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1240687','Papel Aluminio unid','',1.5,null,null,'RELACIONADO A TABACARIA','assets/catalogo/uairango-10999-1240687.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1834227','cuia de silicone','',15,null,null,'HEAD SHOP','assets/catalogo/uairango-10999-1834227.png',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3359057','Dichavador acrilico grande','',20,null,null,'HEAD SHOP','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3359069','Kit Tesoura e cuia to na bê','',35,null,null,'HEAD SHOP','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3377713','Piteira de vidro','',25,null,null,'HEAD SHOP','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-1834225','slik','',17,null,null,'HEAD SHOP','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product'),
('uairango-10999-3359067','Tesoura TO NA BE','',20,null,null,'HEAD SHOP','assets/product-image-pending.svg',true,false,'[]'::jsonb,null,null,'product')
on conflict(id) do nothing;
commit;

-- Auditoria de leitura para uma loja ja em operacao.
-- Execute no SQL Editor do projeto configurado. Nao exige catalogo ou caixa vazios.
begin transaction read only;
with operational_tables as (
  select c.oid,c.relname,c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname=any(array[
    'products','orders','order_items','expenses','product_categories',
    'cash_closings','cash_sessions','cash_movements','cash_register_closings'])
), checks(name,ok) as (
  select 'Nove tabelas operacionais instaladas',count(*)=9 from operational_tables
  union all select 'RLS ativo nas nove tabelas',count(*)=9 and bool_and(relrowsecurity) from operational_tables
  union all select 'Administrador vinculado ao Auth',exists(select 1 from private.admin_users a join auth.users u on u.id=a.user_id)
  union all select 'Visitante sem leitura de pedidos e financas',not exists(
    select 1 from operational_tables where relname not in ('products','product_categories') and has_table_privilege('anon',oid,'SELECT'))
  union all select 'Visitante sem gravacao direta',not exists(
    select 1 from operational_tables where has_table_privilege('anon',oid,'INSERT,UPDATE,DELETE'))
  union all select 'Catalogo publico filtra disponibilidade',exists(
    select 1 from pg_policies where schemaname='public' and tablename='products'
    and policyname='catalogo visitante' and 'anon'=any(roles) and coalesce(qual,'') like '%available%true%')
  union all select 'Campos atuais de produtos instalados',count(*)=8
    from information_schema.columns where table_schema='public' and table_name='products'
    and column_name=any(array['sale_price','promotion_label','featured','kit_items','box_option','parent_product_id','box_units','product_type'])
  union all select 'Categorias editaveis instaladas',exists(
    select 1 from information_schema.columns where table_schema='public' and table_name='product_categories' and column_name='system_key')
  union all select 'Importacao restrita a autenticados',
    coalesce(has_function_privilege('authenticated',to_regprocedure('public.import_catalog_products(jsonb)'),'EXECUTE'),false)
    and not coalesce(has_function_privilege('anon',to_regprocedure('public.import_catalog_products(jsonb)'),'EXECUTE'),true)
  union all select 'Caixa restrito a autenticados',
    coalesce(has_function_privilege('authenticated',to_regprocedure('public.cash_register(text,jsonb)'),'EXECUTE'),false)
    and not coalesce(has_function_privilege('anon',to_regprocedure('public.cash_register(text,jsonb)'),'EXECUTE'),true)
  union all select 'Rotina interna de caixa inacessivel ao cliente',
    not coalesce(has_function_privilege('authenticated',to_regprocedure('public.cash_register_v2(text,jsonb)'),'EXECUTE'),true)
  union all select 'Reset restrito e com confirmacao',
    coalesce(has_function_privilege('authenticated',to_regprocedure('public.reset_operational_data(text)'),'EXECUTE'),false)
    and not coalesce(has_function_privilege('anon',to_regprocedure('public.reset_operational_data(text)'),'EXECUTE'),true)
    and coalesce(pg_get_functiondef(to_regprocedure('public.reset_operational_data(text)')),'') like '%ZERAR%'
  union all select 'Bucket de imagens configurado',exists(
    select 1 from storage.buckets where id='product-images' and public=true
      and file_size_limit=5242880 and allowed_mime_types @> array['image/jpeg','image/png','image/webp','image/avif']::text[])
)
select name as verificacao,case when coalesce(ok,false) then 'OK' else 'REVISAR' end as resultado from checks;
-- Inspecao das regras: autenticado comum nao deve receber os poderes do administrador.
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' or (schemaname='storage' and tablename='objects')
order by schemaname,tablename,policyname;
commit;

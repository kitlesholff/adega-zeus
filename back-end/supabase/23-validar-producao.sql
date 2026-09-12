-- Auditoria final somente de leitura da Adega Zeus.
-- Não cria, altera ou exclui dados. Todos os itens devem retornar OK.
with checks(ordem, verificacao, aprovado, detalhe) as (
  values
    (1, 'Administrador vinculado ao Auth',
      exists (
        select 1 from private.admin_users administrador
        join auth.users usuario on usuario.id = administrador.user_id
      ),
      'Deve existir um administrador vinculado a um usuário real'),

    (2, 'Estrutura operacional completa',
      (select count(*) = 9
       from unnest(array[
         'public.products', 'public.orders', 'public.order_items', 'public.expenses',
         'public.product_categories', 'public.cash_closings', 'public.cash_sessions',
         'public.cash_movements', 'public.cash_register_closings'
       ]) nome(tabela)
       where to_regclass(tabela) is not null),
      'Catálogo, pedidos e caixa devem estar instalados'),

    (3, 'RLS ativo em toda a estrutura pública',
      coalesce((
        select bool_and(tabela.relrowsecurity) and count(*) = 9
        from pg_class tabela
        join pg_namespace esquema on esquema.oid = tabela.relnamespace
        where esquema.nspname = 'public'
          and tabela.relname in (
            'products', 'orders', 'order_items', 'expenses', 'product_categories',
            'cash_closings', 'cash_sessions', 'cash_movements', 'cash_register_closings'
          )
      ), false),
      'Nenhuma tabela operacional pública pode ficar sem RLS'),

    (4, 'Visitante vê somente o catálogo disponível',
      has_table_privilege('anon', 'public.products', 'select')
      and not has_table_privilege('anon', 'public.orders', 'select')
      and not has_table_privilege('anon', 'public.expenses', 'select')
      and exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'products'
          and policyname = 'catalogo visitante'
          and 'anon' = any(roles)
          and coalesce(qual, '') like '%available%true%'
      ),
      'O catálogo é público; pedidos e finanças permanecem privados'),

    (5, 'Catálogo começa sem demonstrações',
      (select count(*) = 0 from public.products)
      and (select count(*) = 0 from public.product_categories),
      'Produtos e categorias reais serão cadastrados pelo administrador'),

    (6, 'Imagens configuradas e protegidas',
      exists (
        select 1 from storage.buckets
        where id = 'product-images' and public = true
          and file_size_limit = 5242880
          and allowed_mime_types @> array[
            'image/jpeg', 'image/png', 'image/webp', 'image/avif'
          ]::text[]
      )
      and (select count(*) = 3 from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and policyname in (
               'admin envia imagens de produtos', 'admin consulta imagens de produtos',
               'admin exclui imagens de produtos'
             )
             and 'authenticated' = any(roles)),
      'Bucket público para exibição; alterações somente pelo administrador'),

    (7, 'Pedidos usam total confiável e código AZ',
      has_function_privilege('anon', 'public.create_order(jsonb)', 'execute')
      and not has_table_privilege('anon', 'public.orders', 'insert')
      and coalesce(pg_get_functiondef(to_regprocedure('public.create_order(jsonb)')), '')
        like '%into valid_item_count, trusted%'
      and coalesce(pg_get_functiondef(to_regprocedure('public.create_order(jsonb)')), '')
        like '%new_code := ''AZ''%',
      'O banco recalcula o preço e identifica os pedidos da Zeus'),

    (8, 'Entrada de pedidos possui limites',
      (select count(*) = 6
       from pg_constraint restricao
       where restricao.conrelid = 'public.orders'::regclass
         and restricao.conname in (
           'orders_customer_name_valid', 'orders_delivery_type_valid',
           'orders_address_valid', 'orders_payment_valid',
           'orders_notes_valid', 'orders_totals_valid'
         ) and restricao.contype = 'c'),
      'Campos, pagamentos e valores do pedido devem ser validados'),

    (9, 'Caixa protegido e transacional',
      has_function_privilege('authenticated', 'public.cash_register(text,jsonb)', 'execute')
      and not has_function_privilege('anon', 'public.cash_register(text,jsonb)', 'execute')
      and not has_function_privilege('authenticated', 'public.cash_register_v2(text,jsonb)', 'execute')
      and not has_table_privilege('authenticated', 'public.cash_movements', 'insert'),
      'O administrador usa a função pública; gravações diretas ficam bloqueadas'),

    (10, 'Fechamento completo no fuso de Extrema',
      coalesce(pg_get_functiondef(to_regprocedure('public.cash_register_v2(text,jsonb)')), '')
        like '%closing_basis%all_payments%'
      and coalesce(pg_get_functiondef(to_regprocedure('public.cash_register_v2(text,jsonb)')), '')
        like '%America/Sao_Paulo%'
      and coalesce(pg_get_functiondef(to_regprocedure('public.cash_register_v2(text,jsonb)')), '')
        like '%jsonb_array_length(fresh->''pending'')>0%',
      'Dinheiro, Pix e cartão entram no fechamento; pendências o bloqueiam'),

    (11, 'Recebimentos e comprovantes imutáveis',
      (select count(*) = 3
       from pg_trigger gatilho
       where not gatilho.tgisinternal
         and gatilho.tgname in (
           'protect_cash_expense', 'protect_confirmed_order', 'protect_confirmed_items'
         ))
      and coalesce(pg_get_functiondef(to_regprocedure('public.set_order_status(uuid,text)')), '')
        like '%if o.status=p_status then return%',
      'Confirmações não duplicam receita e registros contabilizados são preservados'),

    (12, 'Reset geral exige administrador e ZERAR',
      has_function_privilege('authenticated', 'public.reset_operational_data(text)', 'execute')
      and not has_function_privilege('anon', 'public.reset_operational_data(text)', 'execute')
      and not has_function_privilege('authenticated', 'public.reset_operational_data()', 'execute')
      and coalesce(pg_get_functiondef(to_regprocedure('public.reset_operational_data(text)')), '')
        like '%ZERAR%',
      'A limpeza operacional não pode ocorrer acidentalmente'),

    (13, 'Ambiente sem movimentações fictícias',
      (select count(*) = 0 from public.orders)
      and (select count(*) = 0 from public.order_items)
      and (select count(*) = 0 from public.expenses)
      and (select count(*) = 0 from public.cash_sessions)
      and (select count(*) = 0 from public.cash_movements)
      and (select count(*) = 0 from public.cash_register_closings)
      and (select count(*) = 0 from public.cash_closings),
      'Nenhum pedido, saída ou caixa de teste deve permanecer'),

    (14, 'Integridade referencial preservada',
      not exists (
        select 1 from public.order_items item
        left join public.orders pedido on pedido.id = item.order_id
        where pedido.id is null
      )
      and not exists (
        select 1 from public.cash_movements movimento
        left join public.cash_sessions caixa on caixa.id = movimento.session_id
        where caixa.id is null
      ),
      'Não podem existir itens ou movimentações órfãs')
)
select
  ordem,
  verificacao,
  case when aprovado then 'OK' else 'FALHA' end as resultado,
  detalhe
from checks
order by ordem;

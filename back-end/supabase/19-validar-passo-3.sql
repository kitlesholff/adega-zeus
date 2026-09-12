-- Validação somente de leitura do fluxo seguro de pedidos da Adega Zeus.
-- Execute somente depois de 18-validar-pedidos.sql. Todos os itens devem retornar OK.
with checks(ordem, verificacao, aprovado, detalhe) as (
  values
    (1, 'Função pública de pedido instalada',
      to_regprocedure('public.create_order(jsonb)') is not null,
      'create_order(jsonb) deve existir'),

    (2, 'Código de pedido usa a marca Zeus',
      coalesce(
        pg_get_functiondef(to_regprocedure('public.create_order(jsonb)')),
        ''
      ) like '%new_code := ''AZ''%',
      'Novos códigos devem começar com AZ'),

    (3, 'Preço é recalculado pelo banco',
      coalesce(
        pg_get_functiondef(to_regprocedure('public.create_order(jsonb)')),
        ''
      ) like '%into valid_item_count, trusted%'
      and coalesce(
        pg_get_functiondef(to_regprocedure('public.create_order(jsonb)')),
        ''
      ) like '%product.price%'
      and coalesce(
        pg_get_functiondef(to_regprocedure('public.create_order(jsonb)')),
        ''
      ) not like '%client_total_input, client_total_input%',
      'O total confiável deve vir dos produtos disponíveis'),

    (4, 'Visitante usa somente a função controlada',
      has_function_privilege('anon', 'public.create_order(jsonb)', 'execute')
      and not has_table_privilege('anon', 'public.orders', 'insert')
      and not has_table_privilege('anon', 'public.order_items', 'insert'),
      'Anon executa create_order, mas não grava diretamente nas tabelas'),

    (5, 'Função isolada do caminho de busca',
      exists (
        select 1
        from pg_proc procedimento
        join pg_namespace esquema on esquema.oid = procedimento.pronamespace
        where esquema.nspname = 'public'
          and procedimento.proname = 'create_order'
          and procedimento.proconfig @> array['search_path=""']::text[]
      ),
      'A função SECURITY DEFINER deve usar search_path vazio'),

    (6, 'Campos do pedido têm limites',
      (select count(*) = 6
       from pg_constraint restricao
       join pg_class tabela on tabela.oid = restricao.conrelid
       join pg_namespace esquema on esquema.oid = tabela.relnamespace
       where esquema.nspname = 'public'
         and tabela.relname = 'orders'
         and restricao.conname in (
           'orders_customer_name_valid', 'orders_delivery_type_valid',
           'orders_address_valid', 'orders_payment_valid',
           'orders_notes_valid', 'orders_totals_valid'
         )
         and restricao.contype = 'c'),
      'Nome, entrega, endereço, pagamento, observação e totais devem ser validados'),

    (7, 'Nenhum pedido de teste foi criado',
      (select count(*) = 0 from public.orders)
      and (select count(*) = 0 from public.order_items),
      'A validação não deve inserir pedidos fictícios'),

    (8, 'Não existem itens órfãos',
      not exists (
        select 1
        from public.order_items item
        left join public.orders pedido on pedido.id = item.order_id
        where pedido.id is null
      ),
      'Todo item deve pertencer a um pedido existente')
)
select
  ordem,
  verificacao,
  case when aprovado then 'OK' else 'FALHA' end as resultado,
  detalhe
from checks
order by ordem;

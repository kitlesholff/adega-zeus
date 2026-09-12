-- Validação somente de leitura da fundação do projeto Adega Zeus.
-- Todos os itens devem retornar OK.
with checks(ordem, verificacao, aprovado, detalhe) as (
  values
    (1, 'Usuário administrador vinculado',
      exists (
        select 1
        from private.admin_users administrator
        join auth.users usuario on usuario.id = administrator.user_id
      ),
      'Deve existir ao menos um usuário do Auth em private.admin_users'),

    (2, 'Tabelas principais instaladas',
      (select count(*) = 9
       from unnest(array[
         'public.products', 'public.orders', 'public.order_items', 'public.expenses',
         'public.product_categories', 'public.cash_closings', 'public.cash_sessions',
         'public.cash_movements', 'public.cash_register_closings'
       ]) as nomes(nome)
       where to_regclass(nome) is not null),
      'Catálogo, pedidos, despesas e caixa devem existir'),

    (3, 'RLS habilitado nas tabelas expostas',
      coalesce((
        select bool_and(tabela.relrowsecurity)
        from pg_class tabela
        join pg_namespace esquema on esquema.oid = tabela.relnamespace
        where esquema.nspname = 'public'
          and tabela.relname = any(array[
            'products', 'orders', 'order_items', 'expenses', 'product_categories',
            'cash_closings', 'cash_sessions', 'cash_movements', 'cash_register_closings'
          ])
      ), false),
      'Nenhuma tabela operacional pública pode ficar sem RLS'),

    (4, 'Visitante pode consultar o catálogo',
      has_table_privilege('anon', 'public.products', 'select'),
      'A role anon precisa somente de SELECT em products'),

    (5, 'Visitante não consulta pedidos',
      not has_table_privilege('anon', 'public.orders', 'select'),
      'A role anon não pode receber SELECT em orders'),

    (6, 'Visitante não executa função administrativa',
      not has_function_privilege('anon', 'public.is_admin()', 'execute'),
      'is_admin deve ser executável somente por authenticated'),

    (7, 'Política pública limita produtos disponíveis',
      exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'products'
          and policyname = 'catalogo visitante'
          and 'anon' = any(roles)
          and coalesce(qual, '') like '%available%true%'
      ),
      'Visitantes devem enxergar somente available = true'),

    (8, 'Funções operacionais instaladas',
      to_regprocedure('public.create_order(jsonb)') is not null
      and to_regprocedure('public.set_order_status(uuid,text)') is not null
      and to_regprocedure('public.cash_register(text,jsonb)') is not null
      and to_regprocedure('public.reset_operational_data(text)') is not null,
      'Pedidos, confirmação, caixa e reset devem estar disponíveis'),

    (9, 'Bucket de imagens instalado',
      exists (
        select 1 from storage.buckets
        where id = 'product-images' and public = true
      ),
      'O bucket product-images deve existir e ser público para leitura'),

    (10, 'Fuso de Extrema configurado',
      coalesce(
        pg_get_functiondef(to_regprocedure('public.cash_closing_preview(date)')),
        ''
      ) like '%America/Sao_Paulo%',
      'O fechamento deve usar America/Sao_Paulo')
)
select
  ordem,
  verificacao,
  case when aprovado then 'OK' else 'FALHA' end as resultado,
  detalhe
from checks
order by ordem;

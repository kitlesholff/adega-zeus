-- Auditoria somente de leitura do caixa da Adega Zeus.
-- Execute depois de 20-proteger-caixa.sql. Todos os itens devem retornar OK.
with checks(ordem, verificacao, aprovado, detalhe) as (
  values
    (1, 'RLS ativo nas tabelas financeiras',
      coalesce((
        select bool_and(tabela.relrowsecurity) and count(*) = 5
        from pg_class tabela
        join pg_namespace esquema on esquema.oid = tabela.relnamespace
        where esquema.nspname = 'public'
          and tabela.relname in (
            'expenses', 'cash_closings', 'cash_sessions',
            'cash_movements', 'cash_register_closings'
          )
      ), false),
      'Todas as tabelas financeiras expostas devem usar RLS'),

    (2, 'Caixa disponível somente ao administrador autenticado',
      has_function_privilege('authenticated', 'public.cash_register(text,jsonb)', 'execute')
      and not has_function_privilege('anon', 'public.cash_register(text,jsonb)', 'execute')
      and coalesce(
        pg_get_functiondef(to_regprocedure('public.cash_register(text,jsonb)')),
        ''
      ) like '%public.is_admin()%is not true%',
      'O painel autenticado usa a função, mas visitante não pode executá-la'),

    (3, 'Implementação interna não é chamável diretamente',
      not has_function_privilege('authenticated', 'public.cash_register_v2(text,jsonb)', 'execute')
      and not has_function_privilege('anon', 'public.cash_register_v2(text,jsonb)', 'execute')
      and not has_function_privilege('authenticated', 'public.sync_confirmed_receipts()', 'execute'),
      'Funções internas devem ficar privadas'),

    (4, 'Gravação direta nas tabelas do caixa bloqueada',
      not has_table_privilege('authenticated', 'public.cash_sessions', 'insert')
      and not has_table_privilege('authenticated', 'public.cash_movements', 'insert')
      and not has_table_privilege('authenticated', 'public.cash_register_closings', 'insert')
      and not has_table_privilege('authenticated', 'public.cash_closings', 'update')
      and not has_table_privilege('authenticated', 'public.expenses', 'delete'),
      'Movimentações devem passar pelas funções transacionais'),

    (5, 'Limites financeiros instalados',
      (select count(*) = 9
       from pg_constraint restricao
       join pg_class tabela on tabela.oid = restricao.conrelid
       join pg_namespace esquema on esquema.oid = tabela.relnamespace
       where esquema.nspname = 'public'
         and restricao.conname in (
           'cash_sessions_opening_valid', 'cash_sessions_operator_valid',
           'cash_sessions_period_valid', 'cash_movements_amount_valid',
           'cash_movements_description_valid', 'cash_movements_verification_valid',
           'cash_movements_reference_valid', 'cash_register_closings_values_valid',
           'cash_register_closings_text_valid'
         )
         and restricao.contype = 'c'),
      'Valores, textos, referências e períodos devem ser validados pelo banco'),

    (6, 'Pedidos e despesas confirmados ficam protegidos',
      (select count(*) = 3
       from pg_trigger gatilho
       join pg_class tabela on tabela.oid = gatilho.tgrelid
       join pg_namespace esquema on esquema.oid = tabela.relnamespace
       where esquema.nspname = 'public'
         and not gatilho.tgisinternal
         and gatilho.tgname in (
           'protect_cash_expense', 'protect_confirmed_order', 'protect_confirmed_items'
         )),
      'Comprovantes e pedidos contabilizados não podem ser reescritos'),

    (7, 'Fechamento considera todas as formas de pagamento',
      coalesce(
        pg_get_functiondef(to_regprocedure('public.cash_register_v2(text,jsonb)')),
        ''
      ) like '%closing_basis%all_payments%'
      and coalesce(
        pg_get_functiondef(to_regprocedure('public.cash_register_v2(text,jsonb)')),
        ''
      ) like '%jsonb_array_length(fresh->''pending'')>0%'
      and coalesce(
        pg_get_functiondef(to_regprocedure('public.cash_register_v2(text,jsonb)')),
        ''
      ) like '%America/Sao_Paulo%',
      'Dinheiro, Pix e cartão entram no total; pendências bloqueiam o fechamento'),

    (8, 'Confirmação gera um único recebimento',
      to_regprocedure('public.order_payment_method(text)') is not null
      and exists (
        select 1 from pg_trigger
        where tgname = 'protect_confirmed_order' and not tgisinternal
      )
      and coalesce(
        pg_get_functiondef(to_regprocedure('public.protect_confirmed_order()')),
        ''
      ) like '%received<new.trusted_total%'
      and coalesce(
        pg_get_functiondef(to_regprocedure('public.set_order_status(uuid,text)')),
        ''
      ) like '%if o.status=p_status then return%',
      'Repetir a confirmação não pode duplicar o recebimento'),

    (9, 'Reset geral exige confirmação explícita',
      has_function_privilege('authenticated', 'public.reset_operational_data(text)', 'execute')
      and not has_function_privilege('anon', 'public.reset_operational_data(text)', 'execute')
      and not has_function_privilege('authenticated', 'public.reset_operational_data()', 'execute')
      and coalesce(
        pg_get_functiondef(to_regprocedure('public.reset_operational_data(text)')),
        ''
      ) like '%ZERAR%',
      'A limpeza total só pode ocorrer com administrador e a palavra ZERAR'),

    (10, 'Consulta preservada sem acesso de visitante',
      has_table_privilege('authenticated', 'public.cash_closings', 'select')
      and has_table_privilege('authenticated', 'public.expenses', 'select')
      and not has_table_privilege('anon', 'public.cash_closings', 'select')
      and not has_table_privilege('anon', 'public.expenses', 'select'),
      'O administrador consulta o histórico; visitante não vê dados financeiros')
)
select
  ordem,
  verificacao,
  case when aprovado then 'OK' else 'FALHA' end as resultado,
  detalhe
from checks
order by ordem;

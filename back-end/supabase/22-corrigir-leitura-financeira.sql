-- Remove qualquer permissão de leitura financeira herdada por visitantes.
-- Não altera nem exclui dados.
begin;

revoke all on public.cash_closings from public, anon;
revoke all on public.expenses from public, anon;

grant select on public.cash_closings to authenticated;
grant select on public.expenses to authenticated;

commit;

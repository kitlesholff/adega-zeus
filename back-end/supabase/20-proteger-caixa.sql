-- Reforça as regras do caixa da Adega Zeus sem criar ou alterar movimentações.
-- Execute depois de 18-validar-pedidos.sql.
begin;

alter table public.cash_sessions drop constraint if exists cash_sessions_opening_valid;
alter table public.cash_sessions add constraint cash_sessions_opening_valid check (
  opening_cash between 0 and 99999999.99
  and opening_cash = round(opening_cash, 2)
);
alter table public.cash_sessions drop constraint if exists cash_sessions_operator_valid;
alter table public.cash_sessions add constraint cash_sessions_operator_valid
  check (length(trim(opened_by)) between 2 and 200);
alter table public.cash_sessions drop constraint if exists cash_sessions_period_valid;
alter table public.cash_sessions add constraint cash_sessions_period_valid
  check (closed_at is null or closed_at >= opened_at);

alter table public.cash_movements drop constraint if exists cash_movements_amount_valid;
alter table public.cash_movements add constraint cash_movements_amount_valid check (
  amount between 0.01 and 99999999.99
  and amount = round(amount, 2)
);
alter table public.cash_movements drop constraint if exists cash_movements_description_valid;
alter table public.cash_movements add constraint cash_movements_description_valid
  check (length(trim(description)) between 5 and 300);
alter table public.cash_movements drop constraint if exists cash_movements_verification_valid;
alter table public.cash_movements add constraint cash_movements_verification_valid
  check ((verified_at is null) = (verified_by is null));
alter table public.cash_movements drop constraint if exists cash_movements_reference_valid;
alter table public.cash_movements add constraint cash_movements_reference_valid check (
  (kind = 'receipt' and order_id is not null and receipt_id is null)
  or (kind = 'refund' and order_id is null and receipt_id is not null)
  or (kind in ('expense', 'reinforcement', 'withdrawal') and order_id is null and receipt_id is null)
);

alter table public.cash_register_closings drop constraint if exists cash_register_closings_values_valid;
alter table public.cash_register_closings add constraint cash_register_closings_values_valid check (
  counted_cash between 0 and 99999999.99
  and expected_cash between 0 and 99999999.99
  and counted_cash = round(counted_cash, 2)
  and expected_cash = round(expected_cash, 2)
  and difference = round(difference, 2)
);
alter table public.cash_register_closings drop constraint if exists cash_register_closings_text_valid;
alter table public.cash_register_closings add constraint cash_register_closings_text_valid check (
  length(trim(responsible)) between 2 and 200
  and length(notes) <= 1000
);

alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;
alter table public.cash_register_closings enable row level security;
alter table public.cash_closings enable row level security;
alter table public.expenses enable row level security;

-- Toda alteração financeira passa pelas funções transacionais do caixa.
revoke all on public.cash_sessions, public.cash_movements, public.cash_register_closings
  from anon, authenticated;
revoke all on public.cash_closings, public.expenses from public, anon;
revoke insert, update, delete on public.cash_closings from authenticated;
revoke insert, update, delete on public.expenses from authenticated;
grant select on public.cash_closings, public.expenses to authenticated;

revoke all on function public.cash_register(text, jsonb) from public, anon;
grant execute on function public.cash_register(text, jsonb) to authenticated;
revoke all on function public.cash_register_v2(text, jsonb) from public, anon, authenticated;
revoke all on function public.sync_confirmed_receipts() from public, anon, authenticated;
revoke all on function public.reset_operational_data() from public, anon, authenticated;
revoke all on function public.reset_operational_data(text) from public, anon;
grant execute on function public.reset_operational_data(text) to authenticated;

commit;

-- Remove permissoes de gravacao direta de visitantes.
-- Mantem as politicas RLS e as permissoes das funcoes de pedidos e caixa.
begin;
revoke insert, update, delete on table
  public.products,
  public.orders,
  public.order_items,
  public.expenses,
  public.product_categories,
  public.cash_closings,
  public.cash_sessions,
  public.cash_movements,
  public.cash_register_closings
from anon, public;
commit;

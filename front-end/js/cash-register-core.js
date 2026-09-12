(function (root) {
  'use strict';
  const cents = value => Math.round(Number(value) * 100);
  function amount(value, positive = false) {
    const n = Number(value);
    if (value === '' || value == null || !Number.isFinite(n) || n < (positive ? 0.01 : 0) || n > 99999999.99 || Math.abs(n * 100 - cents(n)) > 0.00001) throw Error('Informe um valor válido com até duas casas decimais.');
    return cents(n) / 100;
  }
  function summarize(session, movements, pending = []) {
    const sum = (kind, method) => movements.filter(m => m.kind === kind && (!method || m.method === method)).reduce((n, m) => n + cents(m.amount), 0) / 100;
    const cashIncome = sum('receipt', 'cash'), reinforcement = sum('reinforcement', 'cash');
    const cashExpenses = sum('expense', 'cash'), withdrawal = sum('withdrawal', 'cash'), refund = sum('refund', 'cash');
    const expected = (cents(session?.opening_cash || 0) + cents(cashIncome) + cents(reinforcement) - cents(cashExpenses) - cents(withdrawal) - cents(refund)) / 100;
    const expenses = sum('expense') + sum('withdrawal') + sum('refund');
    const balance = (cents(session?.opening_cash || 0) + cents(sum('receipt')) + cents(reinforcement) - cents(expenses)) / 100;
    return { balance, expenses, cashIncome, reinforcement, cashExpenses, withdrawal, refund, expected, salesTotal: sum('receipt'),
      pix: sum('receipt', 'pix'), card: sum('receipt', 'card'), pending,
      unverified: movements.filter(m => m.kind === 'receipt' && m.method !== 'cash' && !m.verified_at) };
  }
  function closing(summary, fields = {}) {
    if (summary.pending.length) throw Error('Confirme ou cancele todos os pedidos pendentes antes de fechar o caixa.');
    const countedCash = amount(fields.counted_cash);
    const difference = (cents(countedCash) - cents(summary.balance)) / 100;
    const notes = String(fields.notes || '').trim();
    if (difference < 0 && notes.length < 5) throw Error('Informe uma justificativa com pelo menos 5 caracteres para o valor que está faltando.');
    if (notes.length > 1000) throw Error('Use até 1.000 caracteres na observação.');
    if (difference > 0 && fields.confirm_excess !== true) throw Error('Confirme se deseja fechar o caixa mesmo com valor acima do total computado.');
    return { counted_cash: countedCash, difference, notes, keep_pending: false, confirm_excess: difference > 0, closing_basis: 'all_payments' };
  }
  const api = { cents, amount, summarize, closing };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CashRegisterCore = api;
})(typeof window === 'undefined' ? globalThis : window);

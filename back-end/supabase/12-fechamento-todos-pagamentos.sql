-- Execute após 11-pendencias-cancelamento.sql. Preserva comprovantes existentes.
begin;
create or replace function public.cash_register_v2(p_action text, p jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
#variable_conflict use_variable
declare
  s public.cash_sessions; m public.cash_movements; r public.cash_register_closings;
  moves jsonb; pending jsonb; latest jsonb; fresh jsonb; result jsonb;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  actor text := coalesce(nullif(auth.jwt()->>'email',''),auth.uid()::text);
  value numeric; paid numeric; due numeric; expected numeric; counted numeric; diff numeric;
  rev integer; note text; kind text := p->>'kind'; method text := p->>'method';
begin
  if auth.uid() is null or public.is_admin() is not true then raise exception 'Acesso negado.'; end if;
  -- Todas as mutações compartilham o bloqueio: abertura, pagamento dividido e fechamento.
  if p_action not in ('preview','history') then perform pg_advisory_xact_lock(60408,1); end if;
  if p_action = 'history' then
    if coalesce(p->>'month','') !~ '^\d{4}-\d{2}$' then raise exception 'Mês inválido.'; end if;
    select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc),'[]') into result
      from public.cash_register_closings c where to_char(c.business_date,'YYYY-MM')=p->>'month';
    return result;
  end if;
  if p_action = 'open' then
    value := (p->>'opening_cash')::numeric;
    if value is null or value < 0 or value > 99999999.99 or value <> round(value,2) then raise exception 'Fundo inicial inválido.'; end if;
    if exists(select 1 from public.cash_sessions where closed_at is null or business_date=today) then raise exception 'Já existe um caixa aberto ou encerrado hoje.'; end if;
    insert into public.cash_sessions(business_date,opening_cash,opened_by,created_by) values(today,value,actor,auth.uid()) returning * into s;
    return public.cash_register('preview',jsonb_build_object('session_id',s.id));
  end if;
  if p->>'session_id' is not null then
    select * into s from public.cash_sessions where id=(p->>'session_id')::uuid;
  else
    select * into s from public.cash_sessions where closed_at is null or business_date=today order by opened_at desc limit 1;
  end if;
  if p_action = 'preview' then
    -- Um statement captura recebimentos, pedidos e versão na mesma visão do banco.
    select
      coalesce((select jsonb_agg(to_jsonb(cm) order by cm.created_at,cm.id) from public.cash_movements cm where cm.session_id=s.id),'[]'),
      coalesce((select jsonb_agg(to_jsonb(q) order by q.id) from (
        select o.id,o.code,o.customer_name as customer,o.status,
          o.trusted_total-coalesce((select sum(cm.amount) from public.cash_movements cm where cm.order_id=o.id and cm.kind='receipt'),0) as remaining
        from public.orders o where o.status <> 'cancelled'
      ) q where q.remaining>0 or q.status='pending'),'[]'),
      (select to_jsonb(c) from public.cash_register_closings c where c.session_id=s.id order by revision desc limit 1)
    into moves,pending,latest;
    if s.closed_at is not null and latest is not null then pending := latest->'snapshot'->'pending'; end if;
    result := jsonb_build_object('session',case when s.id is null then null else to_jsonb(s) end,'movements',moves,'pending',pending,'latest',latest);
    return result || jsonb_build_object('fingerprint',md5(coalesce(to_jsonb(s)::text,'')||moves::text||pending::text));
  end if;
  if s.id is null then raise exception 'Abra o caixa primeiro.'; end if;
  if p_action <> 'close' and s.closed_at is not null then raise exception 'Caixa fechado. Os lançamentos estão protegidos.'; end if;
  if p_action = 'movement' then
    if exists(select 1 from public.cash_movements where id=(p->>'id')::uuid) then return public.cash_register('preview',p); end if;
    value := (p->>'amount')::numeric;
    if value is null or value <= 0 or value > 99999999.99 or value<>round(value,2) then raise exception 'Valor inválido.'; end if;
    if kind is null or kind not in ('receipt','expense','reinforcement','withdrawal','refund') or method is null or method not in ('cash','pix','card') then raise exception 'Movimentação inválida.'; end if;
    if kind in ('reinforcement','withdrawal') and method <> 'cash' then raise exception 'Reforço e sangria devem ser em dinheiro.'; end if;
    if coalesce(length(trim(p->>'description')),0) not between 5 and 300 then raise exception 'Descreva o lançamento (5 a 300 caracteres).'; end if;
    if kind='receipt' then
      select trusted_total into due from public.orders where id=(p->>'order_id')::uuid and status='confirmed' for update;
      select coalesce(sum(amount),0) into paid from public.cash_movements cm where order_id=(p->>'order_id')::uuid and cm.kind='receipt';
      if due is null or value>due-paid then raise exception 'Confirme o pedido e informe um valor até o saldo pendente.'; end if;
    end if;
    if kind='refund' then
      select * into m from public.cash_movements where id=(p->>'receipt_id')::uuid and cash_movements.kind='receipt' and cash_movements.method=method;
      select coalesce(sum(amount),0) into paid from public.cash_movements where receipt_id=(p->>'receipt_id')::uuid and cash_movements.kind='refund';
      if m.id is null or value+paid>m.amount then raise exception 'Devolução excede o recebimento da mesma forma de pagamento.'; end if;
    end if;
    insert into public.cash_movements(id,session_id,kind,method,amount,description,order_id,receipt_id,created_by)
      values((p->>'id')::uuid,s.id,kind,method,value,trim(p->>'description'),
        case when kind='receipt' then (p->>'order_id')::uuid end,case when kind='refund' then (p->>'receipt_id')::uuid end,auth.uid());
    if kind='expense' then
      insert into public.expenses(description,amount,spent_by,spent_at,cash_movement_id,payment_method)
        values(trim(p->>'description'),value,left(actor,100),now(),(p->>'id')::uuid,method);
    end if;
  elsif p_action='verify' then
    update public.cash_movements set verified_at=now(),verified_by=auth.uid()
      where id=(p->>'id')::uuid and session_id=s.id and cash_movements.kind='receipt' and cash_movements.method<>'cash' and verified_at is null;
  elsif p_action='close' then
    -- Impede alterações de pedidos no intervalo entre o recálculo e a gravação.
    lock table public.orders in share mode;
    fresh := public.cash_register('preview',jsonb_build_object('session_id',s.id));
    select coalesce(max(revision),0) into rev from public.cash_register_closings where session_id=s.id;
    if (p->>'revision')::integer is distinct from rev or p->>'fingerprint' is distinct from fresh->>'fingerprint' then raise exception 'Os dados mudaram. Confira os valores atualizados antes de fechar.'; end if;
    if jsonb_array_length(fresh->'pending')>0 then raise exception 'Confirme ou cancele todos os pedidos pendentes antes de fechar o caixa.'; end if;
    select s.opening_cash + coalesce(sum(case when cm.kind in ('receipt','reinforcement') then cm.amount else -cm.amount end),0)
      into expected from public.cash_movements cm where cm.session_id=s.id ;
    counted := (p->>'counted_cash')::numeric;
    if counted is null or counted<0 or counted>99999999.99 or counted<>round(counted,2) then raise exception 'Valor conferido inválido.'; end if;
    fresh := fresh || jsonb_build_object('closing_basis','all_payments');
    diff := counted-expected; note := coalesce(trim(p->>'notes'),'');
    if diff<0 and length(note)<5 then raise exception 'Informe uma justificativa (5 a 1.000 caracteres) para o valor que está faltando.'; end if;
    if diff>0 and coalesce((p->>'confirm_excess')::boolean,false) is not true then raise exception 'Confirme se deseja fechar o caixa mesmo com valor acima do total computado.'; end if;
    if length(note)>1000 then raise exception 'Use até 1.000 caracteres na observação.'; end if;
    -- Não aninhar comprovantes anteriores dentro de novas versões.
    insert into public.cash_register_closings(session_id,business_date,revision,counted_cash,expected_cash,difference,notes,keep_pending,responsible,created_by,snapshot)
      values(s.id,s.business_date,rev+1,counted,expected,diff,note,false,actor,auth.uid(),fresh-'latest') returning * into r;
    update public.cash_sessions set closed_at=coalesce(closed_at,now()) where id=s.id;
  else raise exception 'Ação inválida.';
  end if;
  return public.cash_register('preview',jsonb_build_object('session_id',s.id));
end;
$$;

revoke all on function public.cash_register_v2(text,jsonb) from public,anon,authenticated;

commit;

(function () {
  'use strict';
  const $ = s => document.querySelector(s), view = $('#cashClosingView');
  const api = window.CashRegisterStore, core = window.CashRegisterCore;
  const money = n => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(n || 0);
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const time = s => new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(s));
  const kinds = {receipt:'Recebimento',expense:'Despesa',reinforcement:'Reforço',withdrawal:'Sangria',refund:'Devolução'};
  const methods = {cash:'Dinheiro',pix:'Pix',card:'Cartão'};
  const input = (name, zero = true) => `<input name="${name}" type="number" min="${zero ? '0' : '0.01'}" max="99999999.99" step="0.01" required placeholder="0,00">`;
  view.innerHTML = `
    <div class="closing-toolbar"><div><span class="eyebrow">Adega &amp; Tabacaria Zeus</span><h2>Fechamento de caixa</h2><p>Dinheiro, Pix e cartão confirmados compõem o fechamento.</p></div><span class="closing-timezone" id="registerDate">Extrema · Minas Gerais</span></div>
    <p id="registerMessage" class="closing-message" role="status" hidden></p><p id="registerLoading" class="closing-help">Carregando caixa…</p>
    <article id="registerOpening" class="closing-card" hidden><span class="card-kicker">Comece um novo expediente</span><h3>Abertura de caixa</h3><p class="closing-help">Os caixas encerrados ficam no histórico abaixo. Para trabalhar novamente, informe o dinheiro disponível para troco e abra um novo caixa. A data é automática; o saldo anterior não é transferido.</p><form id="registerOpenForm"><label>Fundo de abertura (R$)${input('opening_cash')}</label><p class="closing-help register-actor"></p><button class="primary-button" type="submit">Abrir novo caixa</button></form></article>
    <div id="registerContent" hidden><div id="registerSaved" class="closing-saved" hidden></div>
      <section class="closing-card register-sales" aria-labelledby="registerSalesTitle"><div class="register-sales-heading"><div><span class="card-kicker">Abertura + vendas + reforços − saídas</span><h3 id="registerSalesTitle">Saldo do caixa</h3></div><strong id="registerSalesTotal">—</strong></div><div class="register-sales-methods" id="registerSalesMethods"></div><p class="closing-help" id="registerSalesHelp">Vendas do caixa aberto, antes das saídas. O fundo de abertura e os reforços não são vendas.</p></section>
      <details class="closing-card register-pending" id="registerPendingPanel"><summary id="registerPendingTitle">Pendências do caixa</summary><div id="registerPending"></div></details>
      <div class="register-layout"><div class="register-left">
        <article class="closing-card"><div class="register-heading"><span aria-hidden="true">⇄</span><div><h3>Movimentações automáticas</h3><p>Lançamentos do caixa já considerados pelo sistema.</p></div></div><div id="registerTotals"></div><details class="closing-details"><summary>Ver lançamentos</summary><div id="registerMovements"></div></details></article>
        <article class="closing-card"><div class="register-heading"><span aria-hidden="true">▣</span><div><h3>Recebimentos por pagamento</h3><p>Recebimentos contabilizados ao confirmar os pedidos.</p></div></div><div id="registerPayments"></div><p class="closing-help">Vendas confirmadas em dinheiro, Pix e cartão somam automaticamente no total do fechamento.</p></article>
      </div><article class="closing-card" id="registerCountCard"><div class="register-heading"><span aria-hidden="true">▤</span><div><h3>Fechar expediente</h3><p>O total é calculado a partir das vendas recebidas e das saídas.</p></div></div>
        <form id="registerCloseForm"><p class="closing-help">Informe o valor total conferido, somando dinheiro, Pix e cartão. Resolva todos os pedidos pendentes para fechar.</p><label>Valor conferido (R$)${input('counted_cash')}</label><div id="registerDifference" class="closing-difference" role="status">Informe o valor conferido.</div><aside id="registerShortageAlert" class="register-shortage-alert" role="alert" hidden><strong>Há um valor faltando no caixa</strong><p>Justifique a diferença nas observações ou registre a movimentação antes de fechar.</p><button type="button" class="secondary-button" id="registerMissingMovement">Registrar movimentação</button></aside><div class="register-identity"><p class="register-actor"></p><p>Horário registrado automaticamente ao fechar</p></div><label><span id="registerNotesLabel">Observações (opcional)</span><textarea name="notes" rows="3" maxlength="1000"></textarea><small id="registerNotesReason" hidden>A justificativa deve ter pelo menos 5 caracteres.</small></label><button type="submit" class="primary-button">Fechar caixa</button></form></article></div>
      <article class="closing-card register-entry" id="registerEntryCard"><div class="register-heading"><span aria-hidden="true">＋</span><div><h3>Registrar movimentação</h3><p>Pedidos confirmados entram automaticamente. Registre aqui despesas, retiradas e devoluções.</p></div></div><form id="registerMovementForm"><div class="register-entry-grid">
        <label>Tipo<select name="kind">${Object.entries(kinds).filter(([k])=>k!=='receipt').map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>Forma de pagamento<select name="method">${Object.entries(methods).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>Valor (R$)${input('amount',false)}</label><label id="registerOrderLabel">Pedido confirmado<select name="order_id"></select></label><label id="registerReceiptLabel" hidden>Recebimento original<select name="receipt_id"></select></label><label class="register-description">Descrição / motivo<input name="description" minlength="5" maxlength="300" required placeholder="Identifique o recebimento ou explique a saída"></label>
        </div><label id="registerRefundIdLabel" hidden>ID de recebimento de outro caixa (opcional)<input name="external_receipt_id" placeholder="Identificador no comprovante original"></label><button class="primary-button" type="submit">Registrar movimentação</button><p class="closing-help">Data e responsável são automáticos. Cada despesa entra uma única vez; sangria não é despesa.</p></form></article>
    </div><details class="closing-card closing-history" open><summary>Histórico de fechamentos</summary><div class="closing-history-head"><p>Comprovantes preservados, com horário, responsável e versões.</p><label>Mês<input type="month" id="registerMonth"></label></div><div id="registerHistory"></div><details class="closing-details"><summary>Fechamentos anteriores à nova rotina</summary><div id="registerLegacy"></div></details></details>`;
  let state, actor = '', busy = false, generation = 0, historyGeneration = 0, historyRows = [], confirmPayload, selectedSession = null;
  const openForm = $('#registerOpenForm'), closeForm = $('#registerCloseForm'), movementForm = $('#registerMovementForm');
  const message = (text, error = false) => { const el=$('#registerMessage'); el.hidden=!text; el.textContent=text; el.className=`closing-message ${error?'error':'success'}`; };
  const values = form => Object.fromEntries(new FormData(form));
  function table(headers, rows, rowClasses = []) { return `<div class="closing-table-wrap"><table class="closing-table"><thead><tr>${headers.map(v=>`<th>${esc(v)}</th>`).join('')}</tr></thead><tbody>${rows.map((r,i)=>`<tr class="${esc(rowClasses[i] || '')}">${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${headers.length}">Nenhum registro.</td></tr>`}</tbody></table></div>`; }
  function movementsTable(rows) { return table(['Lançamento / ID','Forma','Valor','Horário'],rows.map(m=>[`${kinds[m.kind]} · ${m.description} · ${m.id}`,methods[m.method],money(m.amount),time(m.created_at)]),rows.map(m=>['receipt','reinforcement'].includes(m.kind)?'cash-income':'cash-outcome')); }
  function syncCount() {
    if (!state?.session) return;
    const summary=core.summarize(state.session,state.movements,state.pending), raw=closeForm.elements.counted_cash.value;
    const valid=raw!==''&&Number.isFinite(Number(raw)), difference=valid?(core.cents(raw)-core.cents(summary.balance))/100:null;
    const differenceEl=$('#registerDifference'), shortage=$('#registerShortageAlert'), notes=closeForm.elements.notes;
    differenceEl.className=`closing-difference ${difference===0?'matched':valid?'unmatched':''}`;
    differenceEl.textContent=!valid?'Informe o valor conferido.':difference===0?'O valor confere com o total computado.':`${difference>0?'Valor acima':'Valor faltando'}: ${money(Math.abs(difference))}`;
    shortage.hidden=!valid||difference>=0;
    notes.required=valid&&difference<0;notes.minLength=notes.required?5:0;
    $('#registerNotesLabel').textContent=notes.required?'Justificativa da diferença':'Observações (opcional)';
    $('#registerNotesReason').hidden=!notes.required;
    closeForm.querySelector('button[type=submit]').disabled=busy||state.pending.length>0||!valid||(difference<0&&notes.value.trim().length<5);
  }
  function movementKind() {
    const kind=movementForm.elements.kind.value;
    $('#registerOrderLabel').hidden=kind!=='receipt'; $('#registerReceiptLabel').hidden=kind!=='refund'; $('#registerRefundIdLabel').hidden=kind!=='refund';
    movementForm.elements.order_id.required=kind==='receipt';
    movementForm.elements.method.disabled=['reinforcement','withdrawal'].includes(kind);
    if (movementForm.elements.method.disabled) movementForm.elements.method.value='cash';
  }
  function render() {
    const s=state.session, closed=Boolean(s?.closed_at);
    $('#registerOpening').hidden=Boolean(s); $('#registerContent').hidden=!s;
    document.querySelectorAll('.register-actor').forEach(el=>el.textContent=`Responsável · ${actor}`);
    $('#registerDate').textContent=`${(s?.business_date || window.CashClosingCore.dayKey()).split('-').reverse().join('/')} · Extrema`;
    if (!s) return;
    const summary=core.summarize(s,state.movements,state.pending);
    $('#registerSalesTotal').textContent=money(summary.balance);
    $('#registerSalesTotal').className=summary.balance===0?'amount-zero':summary.balance>0?'amount-positive':'amount-negative';
    $('#registerSalesMethods').innerHTML=[['Dinheiro',summary.cashIncome,'Vendas recebidas em dinheiro'],['Pix',summary.pix,'Recebido na conta'],['Cartão',summary.card,'Vendas aprovadas na máquina']].map(([label,total,help])=>`<div><span>${label}</span><strong class="${total===0?'amount-zero':''}">${money(total)}</strong><small>${help}</small></div>`).join('');
    $('#registerSalesHelp').textContent='Saldo de todas as formas de pagamento, incluindo a abertura e descontando despesas, sangrias e devoluções. Pendentes e cancelados não alteram este valor.';
    $('#registerTotals').innerHTML=[['+','Início de caixa',s.opening_cash,'cash-income','opening'],['+','Vendas recebidas',summary.salesTotal,'cash-income','sales'],['+','Reforços de caixa',summary.reinforcement,'cash-income','reinforcement'],['−','Saídas',summary.expenses,'cash-outcome','outcomes']].map(([icon,title,n,tone,detail])=>`<div class="register-total-group"><div class="register-total ${tone}"><span class="register-icon" aria-hidden="true">${icon}</span><span>${title}</span><button type="button" class="mini-button register-detail-button" data-total-detail="${detail}" aria-expanded="false">Detalhes</button><strong class="${Number(n)===0?'amount-zero':''}">${money(n)}</strong></div><section class="register-automatic-details" data-total-detail-panel="${detail}" aria-live="polite" hidden></section></div>`).join('');
    $('#registerMovements').innerHTML=movementsTable(state.movements);
    $('#registerPayments').innerHTML=['cash','pix','card'].map(method=>`<details class="register-payment"><summary>${methods[method]} <strong class="${(method==='cash'?summary.cashIncome:summary[method])===0?'amount-zero':''}">${money(method==='cash'?summary.cashIncome:summary[method])}</strong><span>Ver recebimentos</span></summary><div>${state.movements.filter(m=>m.kind==='receipt'&&m.method===method).map(m=>`<div class="register-verification"><span>${esc(m.description)} · ${money(m.amount)}<small>${esc(m.id)}</small></span><small>Recebimento registrado</small></div>`).join('')||'<p class="closing-help">Nenhum recebimento registrado.</p>'}</div></details>`).join('');
    $('#registerPendingTitle').textContent=state.pending.length?`⚠ ${state.pending.length} pedidos aguardando confirmação · ${money(state.pending.reduce((n,o)=>n+Number(o.remaining),0))}`:'✓ Nenhum pedido aguardando confirmação';
    $('#registerPendingPanel').open=state.pending.length>0;
    $('#registerPending').innerHTML='<p class="closing-help">Confirme o pagamento recebido ou cancele cada pedido antes de fechar. O cancelamento é definitivo e não altera o saldo.</p>'+state.pending.map(o=>`<div class="register-verification"><span>#${esc(o.code)} · ${esc(o.customer)} · ${money(o.remaining)}</span><div class="closing-buttons"><button type="button" class="mini-button confirm" data-pending-order="${esc(o.id)}" data-order-status="confirmed" ${closed?'disabled':''}>Confirmar recebimento</button><button type="button" class="mini-button cancel" data-pending-order="${esc(o.id)}" data-order-status="cancelled" ${closed?'disabled':''}>Cancelar</button></div></div>`).join('');
    const selected=movementForm.elements.order_id.value;
    movementForm.elements.order_id.innerHTML='<option value="">Selecione o pedido</option>'+state.pending.filter(o=>o.status==='confirmed').map(o=>`<option value="${esc(o.id)}">${esc(o.code)} · ${esc(o.customer)} · ${money(o.remaining)}</option>`).join('');
    movementForm.elements.order_id.value=selected;
    movementForm.elements.receipt_id.innerHTML='<option value="">Selecione o recebimento</option>'+state.movements.filter(m=>m.kind==='receipt').map(m=>`<option value="${esc(m.id)}">${esc(m.description)} · ${methods[m.method]} · ${money(m.amount)}</option>`).join('');
    $('#registerCountCard').hidden=closed; $('#registerEntryCard').hidden=closed;
    $('#registerSaved').hidden=!closed;
    if(closed) $('#registerSaved').innerHTML=`<div><strong>Caixa fechado · versão ${state.latest.revision}</strong><p>${esc(state.latest.responsible)} · ${time(state.latest.created_at)}. Lançamentos protegidos.</p></div><div class="closing-buttons"><button type="button" class="secondary-button" id="registerViewLatest">Ver comprovante</button></div>`;
    closeForm.querySelector('button[type=submit]').textContent='Fechar caixa';
    movementKind(); syncCount();
  }
  async function load() {
    const request=++generation;
    try {
      const [data,name]=await Promise.all([api.rpc('preview',selectedSession?{session_id:selectedSession}:{}),api.user()]);
      if(request!==generation)return;
      const changed=!state || state.fingerprint!==data.fingerprint || actor!==name;
      state=data; actor=name; if(changed)render(); $('#registerLoading').hidden=true;
    } catch(e) { if(request===generation){message(e.message,true);$('#registerLoading').textContent='Não foi possível atualizar o caixa.'; state=null; $('#registerContent').hidden=true; $('#registerOpening').hidden=true;} }
  }
  async function history() {
    const request=++historyGeneration;
    const month=$('#registerMonth').value;
    try {
      const rows=await api.rpc('history',{month}); if(request!==historyGeneration||month!==$('#registerMonth').value)return; historyRows=rows;
      $('#registerHistory').innerHTML=rows.map(r=>`<div class="closing-history-row"><div><strong>${r.business_date.split('-').reverse().join('/')}</strong><small>Versão ${r.revision}</small></div><div>${esc(r.responsible)}<small>${time(r.created_at)}</small></div><strong>${r.difference===0?'Confere':`${r.difference>0?'Sobra':'Falta'} · ${money(Math.abs(r.difference))}`}</strong><div class="closing-buttons"><button class="secondary-button" data-report="${esc(r.id)}">Ver comprovante</button></div></div>`).join('')||'<p class="closing-help">Nenhum fechamento neste mês.</p>';
      const legacy=await window.CashClosingStore.history(month); if(request!==historyGeneration||month!==$('#registerMonth').value)return;
      $('#registerLegacy').innerHTML=legacy.map(r=>`<div class="closing-history-row"><span>${esc(r.closing_date)} · v${r.revision}</span><span>${esc(r.responsible)}</span><span>${money(r.counted_cash)}</span><button class="secondary-button" data-legacy="${esc(r.id)}">Ver comprovante</button></div>`).join('')||'<p class="closing-help">Nenhum registro anterior neste mês.</p>';
    } catch(e){if(request===historyGeneration)$('#registerHistory').textContent=e.message;}
  }
  async function mutate(action,payload,form) {
    if(busy)return; busy=true; ++generation;
    const buttons=view.querySelectorAll('button'); buttons.forEach(b=>b.disabled=true);
    try {state=await api.rpc(action,payload); window.dispatchEvent(new CustomEvent('snoop:cash-changed')); form?.reset();  message(action==='open'?'Caixa aberto. Registre os recebimentos e as saídas durante o expediente.':'Lançamento salvo. Conferência atualizada.'); render(); await history();return true;}
    catch(e){message(e.message,true);await load();return false;}
    finally {busy=false;buttons.forEach(b=>b.disabled=false);syncCount();}
  }
  async function automaticDetails(type) {
    if(!state)return;
    const panel=view.querySelector(`[data-total-detail-panel="${type}"]`),button=view.querySelector(`[data-total-detail="${type}"]`);
    if(!panel||!button)return;
    if(!panel.hidden){panel.hidden=true;button.setAttribute('aria-expanded','false');return;}
    const close=`<button type="button" class="icon-button" data-close-total-detail="${type}" aria-label="Fechar detalhes">×</button>`;
    button.setAttribute('aria-expanded','true');
    panel.hidden=false;panel.innerHTML='<p class="closing-help">Carregando detalhes…</p>';
    if(type==='opening'){
      panel.innerHTML=`<div class="register-detail-head"><div><span>Início de caixa</span><strong>Valor do início do expediente</strong></div>${close}</div><div class="register-detail-summary"><span>${time(state.session.opened_at)} · ${esc(state.session.opened_by)}</span><strong>${money(state.session.opening_cash)}</strong></div>`;
      return;
    }
    if(type==='sales'){
      try{
        const orders=await window.StoreAPI.getOrders();if(!state)return;
        const receipts=state.movements.filter(m=>m.kind==='receipt'), byOrder=new Map(orders.map(o=>[o.id,o]));
        panel.innerHTML=`<div class="register-detail-head"><div><span>Vendas recebidas</span><strong>Compras confirmadas</strong></div>${close}</div><div class="register-sales-detail">${receipts.map(m=>{const o=byOrder.get(m.order_id),items=(o?.items||[]).map(i=>`${Number(i.quantity)}x ${esc(i.name)} · ${money(i.subtotal)}`).join('<br>');return `<article><div><strong>${o?`#${esc(o.code)} · ${esc(o.customerName)}`:esc(m.description)}</strong><small>${o?`${esc(o.payment)} · ${time(o.confirmedAt||o.createdAt)}`:`${methods[m.method]} · ${time(m.created_at)}`}</small></div><b>${money(m.amount)}</b>${items?`<p>${items}</p>`:'<p>Itens não disponíveis neste registro.</p>'}</article>`;}).join('')||'<p class="closing-help">Nenhuma compra confirmada neste expediente.</p>'}</div>`;
      }catch(err){panel.innerHTML=`<div class="register-detail-head"><strong>Vendas recebidas</strong>${close}</div><p class="closing-message error">${esc(err.message||'Não foi possível carregar as compras.')}</p>`;}
      return;
    }
    const selected=state.movements.filter(m=>type==='reinforcement'?m.kind==='reinforcement':['expense','withdrawal','refund'].includes(m.kind));
    panel.innerHTML=`<div class="register-detail-head"><div><span>${type==='reinforcement'?'Reforços de caixa':'Saídas'}</span><strong>${type==='reinforcement'?'Valores adicionados ao expediente':'Valores retirados do expediente'}</strong></div>${close}</div>${movementsTable(selected)}`;
  }
  let openingRequest=null;
  openForm.addEventListener('input',()=>{openingRequest=null;});
  openForm.addEventListener('submit',e=>{e.preventDefault();if(openForm.reportValidity()){openingRequest ||= crypto.randomUUID();mutate('open',{...values(openForm),id:openingRequest},openForm).then(saved=>{if(saved)openingRequest=null;});}});
  movementForm.addEventListener('change',movementKind);
  let movementRequest=null;
  movementForm.addEventListener('input',()=>{movementRequest=null;});
  movementForm.addEventListener('submit',async e=>{e.preventDefault();if(!state||!movementForm.reportValidity())return;const p=values(movementForm);p.method=movementForm.elements.method.value;p.receipt_id=p.external_receipt_id.trim()||p.receipt_id;if(['expense','withdrawal','refund'].includes(p.kind)){const approved=await window.AdminFeedback.confirm({tone:'warning',title:'Confirmar saída do caixa?',message:`${kinds[p.kind]} de ${money(Number(p.amount))} por ${methods[p.method]}.\n${p.description}`,confirmLabel:'Confirmar saída'});if(!approved)return}movementRequest ||= crypto.randomUUID();mutate('movement',{...p,id:movementRequest,session_id:state.session.id},movementForm).then(saved=>{if(saved)movementRequest=null;});});
  closeForm.elements.counted_cash.addEventListener('keydown',e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown')e.preventDefault();});
  closeForm.elements.counted_cash.addEventListener('wheel',e=>e.preventDefault(),{passive:false});
  $('#registerMissingMovement').addEventListener('click',()=>{
    if(!state)return;
    const summary=core.summarize(state.session,state.movements,state.pending), counted=Number(closeForm.elements.counted_cash.value);
    const missing=(core.cents(summary.balance)-core.cents(counted))/100;if(missing<=0)return;
    movementForm.elements.amount.value=missing.toFixed(2);movementRequest=null;
    $('#registerEntryCard').scrollIntoView({behavior:'smooth',block:'start'});movementForm.elements.amount.focus();
  });
  closeForm.addEventListener('input',syncCount);
  const dialog=$('#cashClosingConfirm');
  closeForm.addEventListener('submit',async e=>{
    e.preventDefault();if(busy||!state||!closeForm.reportValidity())return;
    try {
      // Recalcula ao iniciar a confirmação; a gravação volta a conferir no servidor.
      const fresh=await api.rpc('preview',{session_id:state.session.id});state=fresh;render();
      const summary=core.summarize(state.session,state.movements,state.pending), formValues=values(closeForm);
      const difference=(core.cents(formValues.counted_cash)-core.cents(summary.balance))/100;
      const fields=core.closing(summary,{...formValues,confirm_excess:difference>0},state.latest?.revision||0);
      confirmPayload={...fields,session_id:state.session.id,revision:state.latest?.revision||0,fingerprint:state.fingerprint};
      $('#closingConfirmTitle').textContent=difference>0?'Fechar com valor acima?':'Fechar caixa';
      $('#saveCashClosing').textContent=difference>0?'Fechar mesmo assim':'Confirmar fechamento';
      $('#closingConfirmSummary').innerHTML=table(['Fechamento','Valor'],[['Início de caixa',money(state.session.opening_cash)],['Vendas em dinheiro',money(summary.cashIncome)],['Vendas em Pix',money(summary.pix)],['Vendas em cartão',money(summary.card)],['Reforços',money(summary.reinforcement)],['Saídas',money(summary.expenses)],['Total computado',money(summary.balance)],['Valor conferido',money(fields.counted_cash)],['Diferença',money(fields.difference)]],['','','','','','','','',difference===0?'cash-income':'cash-outcome'])+(difference>0?`<p class="closing-excess-warning"><strong>O valor informado supera o total computado em ${esc(money(difference))}.</strong><br>Deseja fechar o caixa mesmo assim?</p>`:'')+`<p>${esc(fields.notes)}</p>`;
      $('#closingConfirmError').hidden=true;dialog.showModal();
    } catch(err){message(err.message,true);}
  });
  $('#saveCashClosing').addEventListener('click',async()=>{
    if(busy||!confirmPayload)return; busy=true;++generation;$('#saveCashClosing').disabled=true;
    try{const saved=await api.rpc('close',confirmPayload);selectedSession=null;state=null;closeForm.reset();dialog.close();$('#registerMonth').value=saved.session.business_date.slice(0,7);await load();await history();message('Caixa encerrado e armazenado no histórico. Você já pode iniciar um novo expediente.');}
    catch(e){$('#closingConfirmError').hidden=false;$('#closingConfirmError').textContent=e.message;}
    finally{busy=false;$('#saveCashClosing').disabled=false;syncCount();}
  });
  document.querySelectorAll('[data-close-closing]').forEach(b=>b.addEventListener('click',()=>{if(!busy)b.closest('dialog').close();}));
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  dialog.querySelector('.closing-help').textContent='O fechamento preserva todas as vendas confirmadas, as saídas e o total do expediente.';
  function report(row,legacy=false) {
    const body=$('#closingReportBody');
    body.innerHTML=`<h3>${esc(row.business_date||row.closing_date)} · versão ${row.revision}</h3><p>${esc(row.responsible)} · ${time(row.created_at)}</p>`+(row.snapshot.closing_basis==='all_payments'?table(['Fechamento','Valor'],[['Total computado',money(row.expected_cash)],['Valor conferido',money(row.counted_cash)],['Diferença',money(row.difference)],['Dinheiro',money(core.summarize(row.snapshot.session,row.snapshot.movements).cashIncome)],['Pix',money(core.summarize(row.snapshot.session,row.snapshot.movements).pix)],['Cartão',money(core.summarize(row.snapshot.session,row.snapshot.movements).card)]]):table(['Conferência anterior','Valor'],[['Saldo em dinheiro',money(row.expected_cash)],['Contado',money(row.counted_cash)],['Diferença',money(row.difference)]]))+`<p class="closing-report-notes">${esc(row.notes||'Sem observações.')}</p>`;
    if(legacy) body.innerHTML+=`<p class="closing-help">Comprovante da rotina anterior, calculado com pedidos confirmados por data de criação.</p>`+table(['Conferência anterior','Valor'],[['Fundo inicial',money(row.opening_cash)],['Saídas em dinheiro',money(row.cash_expenses)],['Vendas confirmadas',money(row.snapshot.summary.income)]])+table(['Pedido','Cliente','Pagamento','Status','Valor'],row.snapshot.orders.map(o=>[o.code,o.customerName,o.payment,o.status,money(o.trustedTotal)]))+table(['Saída','Responsável','Valor'],row.snapshot.expenses.map(e=>[e.description,e.spentBy,money(e.amount)]));
    else body.innerHTML+=table(['Abertura','Valor'],[['Fundo',money(row.snapshot.session.opening_cash)],['Horário',time(row.snapshot.session.opened_at)],['Responsável',row.snapshot.session.opened_by]])+movementsTable(row.snapshot.movements)+table(['Pendência preservada','Saldo'],row.snapshot.pending.map(o=>[o.code,money(o.remaining)]));
    $('#cashClosingReport').showModal();
  }
  view.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.totalDetail){await automaticDetails(b.dataset.totalDetail);return;}
    if(b.dataset.closeTotalDetail!==undefined){const panel=view.querySelector(`[data-total-detail-panel="${b.dataset.closeTotalDetail}"]`),button=view.querySelector(`[data-total-detail="${b.dataset.closeTotalDetail}"]`);if(panel)panel.hidden=true;if(button)button.setAttribute('aria-expanded','false');return;}
    if(b.dataset.pendingOrder&&state&&!busy&&!state.session.closed_at){
      busy=true;view.querySelectorAll('button').forEach(button=>button.disabled=true);
      try{await window.StoreAPI.updateOrderStatus(b.dataset.pendingOrder,b.dataset.orderStatus);window.dispatchEvent(new CustomEvent('snoop:orders-changed'));await load();message('Pedido atualizado. Saldo e pendências recalculados.');}
      catch(err){message(err.message,true);await load();}
      finally{busy=false;view.querySelectorAll('button').forEach(button=>button.disabled=false);if(state)render();}
      return;
    }
    if(b.id==='registerViewLatest')report(state.latest);
    if(b.dataset.report)report(historyRows.find(r=>r.id===b.dataset.report));
    if(b.dataset.legacy)try{report(await window.CashClosingStore.get(b.dataset.legacy),true);}catch(err){message(err.message,true);}
  });
  $('#printCashClosing').addEventListener('click',()=>{
    const popup=window.open('','_blank','width=1000,height=800');if(!popup){message('Permita a janela de impressão no navegador.',true);return;}
    popup.opener=null;popup.document.write('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Comprovante de caixa · Adega Zeus</title><style>body{font:13px Arial;padding:24px;color:#111}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{padding:8px;border-bottom:1px solid #ccc;text-align:left;overflow-wrap:anywhere}tr{break-inside:avoid}p{white-space:pre-wrap}thead{display:table-header-group}</style><h1>Adega &amp; Tabacaria Zeus · Caixa</h1>'+$('#closingReportBody').innerHTML+'</html>');popup.document.close();popup.focus();popup.print();
  });
  $('#registerMonth').value=window.CashClosingCore.dayKey().slice(0,7);$('#registerMonth').addEventListener('change',history);
  window.AdminCashClosing={open:()=>{selectedSession=null;state=null;$('#registerContent').hidden=true;$('#registerOpening').hidden=true;$('#registerLoading').hidden=false;$('#registerLoading').textContent='Carregando caixa…';load();history();}};
  window.addEventListener('snoop:data-reset',()=>{
    ++generation;++historyGeneration;historyRows=[];state=null;selectedSession=null;confirmPayload=null;openingRequest=null;movementRequest=null;
    closeForm.reset();openForm.reset();movementForm.reset();message('');
    $('#registerContent').hidden=true;$('#registerOpening').hidden=true;$('#registerHistory').innerHTML='';$('#registerLegacy').innerHTML='';$('#closingReportBody').innerHTML='';
    $('#cashClosingReport').close();dialog.close();
    if(!view.hidden){load();history();}
  });
  window.addEventListener('storage',()=>{if(!view.hidden&&!busy&&!dialog.open)load();});
  window.addEventListener('focus',()=>{if(!view.hidden&&!busy&&!dialog.open)load();});
  window.setInterval(()=>{if(!view.hidden&&!document.hidden&&!busy&&!dialog.open)load();},15000);
})();

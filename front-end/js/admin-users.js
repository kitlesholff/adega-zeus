(function () {
  'use strict';
  const form = document.querySelector('#operatorForm');
  const list = document.querySelector('#operatorList');
  const status = document.querySelector('#operatorStatus');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let loading = false;
  async function refresh() {
    if (StoreAPI.panelRole !== 'admin' || loading) return;
    loading = true;
    try {
      const users = await StoreAPI.listOperators();
      list.innerHTML = users.length ? users.map(user => `<article class="operator-row"><div><strong>${escape(user.display_name)}</strong><span>${escape(user.email)}</span><small>Pedidos e Caixa · ${user.active ? 'Ativo' : 'Acesso desativado'}</small></div><button type="button" class="secondary-button" data-operator="${escape(user.user_id)}" data-active="${!user.active}">${user.active ? 'Desativar acesso' : 'Reativar acesso'}</button></article>`).join('') : '<p class="muted">Nenhum operador cadastrado.</p>';
    } catch (error) {
      list.replaceChildren();
      status.textContent = error.message;
    } finally { loading = false; }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (StoreAPI.panelRole !== 'admin') return;
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    status.textContent = 'Criando usuário…';
    const data = new FormData(form);
    try {
      const created = await StoreAPI.createOperator({name:data.get('name'),email:data.get('email'),password:data.get('password')});
      form.reset();
      status.textContent = `Usuário criado: ${created.email || data.get('email')}. Ele já pode entrar com esse e-mail e a senha definidos, com acesso a Pedidos e Caixa.`;
      await refresh();
    } catch (error) { status.textContent = error.message; }
    finally { form.elements.password.value = ''; button.disabled = false; }
  });
  list.addEventListener('click', async event => {
    const button = event.target.closest('[data-operator]');
    if (!button || StoreAPI.panelRole !== 'admin') return;
    button.disabled = true;
    try {
      await StoreAPI.setOperatorActive(button.dataset.operator, button.dataset.active === 'true');
      status.textContent = button.dataset.active === 'true' ? 'Acesso reativado.' : 'Acesso desativado. Novas operações deste usuário serão bloqueadas.';
      await refresh();
    } catch (error) { status.textContent = error.message; button.disabled = false; }
  });
  window.AdminUsers = { refresh };
})();

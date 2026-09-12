(function () {
  'use strict';
  const dialog = document.querySelector('#feedbackDialog');
  const title = document.querySelector('#feedbackTitle');
  const message = document.querySelector('#feedbackMessage');
  const kicker = document.querySelector('#feedbackKicker');
  const icon = document.querySelector('#feedbackIcon');
  const confirmButton = document.querySelector('#feedbackConfirm');
  const cancelButton = document.querySelector('#feedbackCancel');
  const notifications = document.querySelector('#feedbackNotifications');
  const queue = [];
  let active = null;

  const tones = {
    success: { icon: '✓', kicker: 'Concluído', title: 'Tudo certo' },
    warning: { icon: '!', kicker: 'Atenção', title: 'Confirme para continuar' },
    danger: { icon: '×', kicker: 'Erro', title: 'Não foi possível concluir' }
  };

  function inferTone(text) {
    if (/não foi possível|incorret|inválid|erro|negad|falha|indisponível/i.test(text)) return 'danger';
    if (/antes de|tem certeza|definitiv|já existe|deve|selecione|adicione|informe|altere/i.test(text)) return 'warning';
    return 'success';
  }

  function showNext() {
    if (active || !queue.length) return;
    active = queue.shift();
    const tone = active.tone === 'auto' ? inferTone(active.message) : active.tone;
    const preset = tones[tone] || tones.success;
    dialog.dataset.tone = tone;
    icon.textContent = preset.icon;
    kicker.textContent = active.kicker || preset.kicker;
    title.textContent = active.title || preset.title;
    message.textContent = active.message;
    cancelButton.hidden = !active.cancelLabel;
    cancelButton.textContent = active.cancelLabel || 'Cancelar';
    confirmButton.textContent = active.confirmLabel || 'OK';
    dialog.showModal();
    confirmButton.focus();
  }

  function finish(result) {
    if (!active) return;
    const current = active;
    active = null;
    if (dialog.open) dialog.close();
    current.resolve(result);
    setTimeout(showNext, 0);
  }

  function enqueue(options) {
    return new Promise(resolve => {
      queue.push({ tone: 'auto', message: '', ...options, resolve });
      showNext();
    });
  }

  function notify(messageText, requestedTone = 'auto', titleText = '') {
    const tone = requestedTone === 'auto' ? inferTone(messageText) : requestedTone;
    const preset = tones[tone] || tones.success;
    const notification = document.createElement('article');
    notification.className = 'feedback-notification';
    notification.dataset.tone = tone;
    notification.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
    const notificationIcon = document.createElement('span');
    notificationIcon.className = 'feedback-notification-icon';
    notificationIcon.setAttribute('aria-hidden', 'true');
    notificationIcon.textContent = preset.icon;
    const copy = document.createElement('div');
    const heading = document.createElement('strong');
    heading.textContent = titleText || (tone === 'success' ? 'Confirmado' : preset.kicker);
    const text = document.createElement('p');
    text.textContent = messageText;
    copy.append(heading, text);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'feedback-notification-close';
    close.setAttribute('aria-label', 'Fechar aviso');
    close.textContent = '×';
    notification.append(notificationIcon, copy, close);
    notifications.prepend(notification);
    requestAnimationFrame(() => notification.classList.add('visible'));
    let timer = setTimeout(remove, 5000);
    function remove() {
      clearTimeout(timer);
      notification.classList.remove('visible');
      setTimeout(() => notification.remove(), 220);
    }
    close.addEventListener('click', remove);
    return Promise.resolve(true);
  }

  confirmButton.addEventListener('click', () => finish(true));
  cancelButton.addEventListener('click', () => finish(false));
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    finish(false);
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog && active?.cancelLabel) finish(false);
  });

  document.querySelectorAll('dialog').forEach(panel => {
    panel.addEventListener('click', event => {
      if (!panel.open) return;
      const bounds = panel.getBoundingClientRect();
      const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
      if (!outside) return;
      const cancelEvent = new Event('cancel', { cancelable: true });
      if (panel.dispatchEvent(cancelEvent) && panel.open) panel.close('cancel');
    });
  });

  window.AdminFeedback = {
    notify,
    confirm({ message: messageText, tone = 'warning', title: titleText = '', confirmLabel = 'Confirmar', cancelLabel = 'Cancelar' }) {
      return enqueue({ message: messageText, tone, title: titleText, confirmLabel, cancelLabel });
    }
  };
})();

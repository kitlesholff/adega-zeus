(function () {
  'use strict';
  const panel = document.querySelector('#dashboardView');
  if (!panel) return;
  const popup = document.createElement('div');
  popup.className = 'dashboard-tooltip'; popup.hidden = true; popup.setAttribute('aria-hidden', 'true');
  document.body.append(popup);
  let active = null, timer = null, press = null, held = false;
  function cancelPress() { clearTimeout(timer); timer = null; press = null; }
  function hide() { cancelPress(); active = null; popup.hidden = true; }
  function show(button) {
    active = button;
    popup.textContent = document.getElementById(button.getAttribute('aria-describedby')).textContent;
    popup.hidden = false;
    const box = button.getBoundingClientRect(), width = popup.offsetWidth, height = popup.offsetHeight;
    popup.style.left = Math.max(12, Math.min(box.right - width, window.innerWidth - width - 12)) + 'px';
    popup.style.top = Math.max(12, box.bottom + height + 20 <= window.innerHeight ? box.bottom + 8 : box.top - height - 8) + 'px';
  }
  panel.querySelectorAll('.metric-help').forEach(button => {
    button.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') show(button); });
    button.addEventListener('pointerleave', e => { cancelPress(); if (e.pointerType === 'mouse' && !popup.contains(e.relatedTarget)) hide(); });
    button.addEventListener('focus', () => { if (!press && button.matches(':focus-visible')) show(button); });
    button.addEventListener('blur', () => { if (active === button) hide(); });
    button.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      cancelPress(); held = false; press = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => { held = true; show(button); }, 450);
    });
    button.addEventListener('pointermove', e => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancelPress(); });
    button.addEventListener('pointerup', cancelPress);
    button.addEventListener('pointercancel', hide);
    button.addEventListener('contextmenu', e => e.preventDefault());
    button.addEventListener('click', () => { if (held) { held = false; return; } show(button); });
  });
  popup.addEventListener('pointerleave', e => { if (!active?.contains(e.relatedTarget)) hide(); });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.metric-help') && !popup.contains(e.target)) hide(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  new MutationObserver(() => { if (panel.hidden) hide(); }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
})();

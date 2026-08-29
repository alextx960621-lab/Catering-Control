(() => {
  if (!('serviceWorker' in navigator)) return;

  function injectStyles() {
    if (document.getElementById('pwa-ui-styles')) return;
    const style = document.createElement('style');
    style.id = 'pwa-ui-styles';
    style.textContent = `
      @keyframes pwaDropIn {
        from { opacity: 0; transform: translateY(-10px) scale(.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .pwa-stack {
        position: fixed;
        top: max(12px, env(safe-area-inset-top, 0px));
        left: 50%;
        transform: translateX(-50%);
        z-index: 9999;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 9px;
        width: min(94vw, 420px);
        pointer-events: none;
      }
      .pwa-banner {
        pointer-events: auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        line-height: 1.15;
        border: none;
        border-radius: 14px;
        font: 600 14px/1.15 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
        letter-spacing: .01em;
        cursor: pointer;
        color: #fff;
        padding: 13px 18px;
        box-shadow: 0 10px 26px rgba(0,0,0,.16), 0 2px 8px rgba(0,0,0,.10);
        animation: pwaDropIn .3s cubic-bezier(.2,.8,.2,1) both;
        transition: transform .15s ease, box-shadow .15s ease, filter .15s ease;
      }
      .pwa-banner:hover { transform: translateY(1px); filter: brightness(1.05); }
      .pwa-banner:active { transform: scale(.98); }
      .pwa-banner:disabled { opacity: .65; cursor: default; }
      .pwa-banner svg { flex: 0 0 auto; display: block; }
      .pwa-install { background: linear-gradient(135deg, #2f7bff, #0d6efd); }
      .pwa-update { background: linear-gradient(135deg, #23a866, #198754); }
      @media (max-width: 480px) {
        .pwa-banner { padding: 12px 14px; font-size: 13px; }
      }
    `;
    document.head.appendChild(style);
  }

  const ICON_DOWNLOAD = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 19.5V20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.5"/></svg>';
  const ICON_REFRESH = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.3-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.3 6.4L3 16"/><path d="M8 21H3v-5"/></svg>';

  function ensureStack() {
    let stack = document.getElementById('pwa-stack');
    if (!stack) {
      injectStyles();
      stack = document.createElement('div');
      stack.id = 'pwa-stack';
      stack.className = 'pwa-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }

  let deferredPrompt = null;
  let installBtn = null;

  function showInstallButton() {
    if (installBtn || window.matchMedia('(display-mode: standalone)').matches) return;
    installBtn = document.createElement('button');
    installBtn.className = 'pwa-banner pwa-install';
    installBtn.innerHTML = `${ICON_DOWNLOAD}<span>Instalar app</span>`;
    installBtn.setAttribute('aria-label', 'Instalar la aplicación');
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      installBtn.disabled = true;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      hideInstallButton();
    });
    ensureStack().appendChild(installBtn);
  }
  function hideInstallButton() {
    if (installBtn) { installBtn.remove(); installBtn = null; }
  }
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); // evita el mini-banner automático de Chrome
    deferredPrompt = e;
    showInstallButton();
  });
  window.addEventListener('appinstalled', hideInstallButton);

  function showUpdateToast(worker) {
    const toast = document.createElement('button');
    toast.className = 'pwa-banner pwa-update';
    toast.innerHTML = `${ICON_REFRESH}<span>Actualización disponible — recargar</span>`;
    toast.addEventListener('click', () => {
      toast.disabled = true;
      toast.innerHTML = `${ICON_REFRESH}<span>Actualizando…</span>`;
      worker.postMessage('SKIP_WAITING');
    });
    ensureStack().prepend(toast); // primero: es más urgente que "instalar"
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      if (reg.waiting) showUpdateToast(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateToast(newWorker);
          }
        });
      });
    }).catch(err => console.warn('[PWA] No se pudo registrar el Service Worker:', err));

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
})();

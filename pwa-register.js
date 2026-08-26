/* ==========================================================================
   PWA: registro del Service Worker + botón "Instalar app" + aviso de
   "hay una actualización disponible". Un solo archivo, compartido por
   login.html, index.html y cliente.html (se agrega con <script defer>).
   ========================================================================== */
(() => {
  if (!('serviceWorker' in navigator)) return;

  /* ---------- Estilos compartidos (una sola vez) ---------- */
  function injectStyles() {
    if (document.getElementById('pwa-ui-styles')) return;
    const style = document.createElement('style');
    style.id = 'pwa-ui-styles';
    style.textContent = `
      @keyframes pwaSlideUp {
        from { opacity: 0; transform: translateY(14px) scale(.96); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .pwa-fab {
        position: fixed;
        z-index: 9999;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        line-height: 1;
        border: none;
        border-radius: 999px;
        font: 600 14px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
        letter-spacing: .01em;
        cursor: pointer;
        color: #fff;
        padding: 13px 20px 13px 16px;
        box-shadow: 0 6px 20px rgba(0,0,0,.22), 0 2px 6px rgba(0,0,0,.14);
        animation: pwaSlideUp .35s cubic-bezier(.2,.8,.2,1) both;
        transition: transform .15s ease, box-shadow .15s ease, filter .15s ease;
      }
      .pwa-fab:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(0,0,0,.26), 0 3px 8px rgba(0,0,0,.16); filter: brightness(1.04); }
      .pwa-fab:active { transform: translateY(0) scale(.98); }
      .pwa-fab:disabled { opacity: .65; cursor: default; transform: none; }
      .pwa-fab svg { flex: 0 0 auto; display: block; }
      .pwa-install {
        right: 18px;
        bottom: 18px;
        background: linear-gradient(135deg, #2f7bff, #0d6efd);
      }
      .pwa-update {
        left: 50%;
        bottom: 18px;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #23a866, #198754);
      }
      .pwa-update:hover { transform: translateX(-50%) translateY(-2px); }
      .pwa-update:active { transform: translateX(-50%) scale(.98); }
      @media (max-width: 480px) {
        .pwa-fab { padding: 12px 18px 12px 14px; font-size: 13.5px; }
      }
    `;
    document.head.appendChild(style);
  }

  const ICON_DOWNLOAD = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 19.5V20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-.5"/></svg>';
  const ICON_REFRESH = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.3-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.3 6.4L3 16"/><path d="M8 21H3v-5"/></svg>';

  /* ---------- Botón "Instalar app" ----------
     Chrome dispara el evento "beforeinstallprompt" cuando detecta que el
     sitio cumple los requisitos de instalación, pero NO muestra nada solo
     — hay que guardar ese evento y mostrar nuestro propio botón que, al
     tocarlo, abre el diálogo nativo de instalación. Así el usuario ve
     algo que tocar en vez de depender del banner automático (que a veces
     tarda varias visitas en aparecer). */
  let deferredPrompt = null;
  let installBtn = null;

  function showInstallButton() {
    // Si ya está instalada (abierta como app), no mostrar el botón.
    if (installBtn || window.matchMedia('(display-mode: standalone)').matches) return;
    injectStyles();
    installBtn = document.createElement('button');
    installBtn.className = 'pwa-fab pwa-install';
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
    document.body.appendChild(installBtn);
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

  /* ---------- Aviso "hay una actualización disponible" ----------
     Cuando subes cambios nuevos (HTML/CSS/JS), el navegador descarga el
     sw.js nuevo en segundo plano, pero por defecto se queda "esperando"
     hasta que el usuario cierre todas las pestañas — para no interrumpir
     a alguien a mitad de una tarea. Este aviso le da al usuario el
     control: le muestra un cartel y, si toca "Recargar", activa la
     versión nueva al instante. */
  function showUpdateToast(worker) {
    injectStyles();
    const toast = document.createElement('button');
    toast.className = 'pwa-fab pwa-update';
    toast.innerHTML = `${ICON_REFRESH}<span>Actualización disponible — recargar</span>`;
    toast.addEventListener('click', () => {
      toast.disabled = true;
      toast.innerHTML = `${ICON_REFRESH}<span>Actualizando…</span>`;
      worker.postMessage('SKIP_WAITING');
    });
    document.body.appendChild(toast);
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      // Por si ya había una versión nueva esperando de una visita anterior.
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

    // Cuando el SW nuevo toma el control (tras tocar "Recargar" arriba),
    // recargar la página una sola vez para que cargue con los archivos nuevos.
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
})();

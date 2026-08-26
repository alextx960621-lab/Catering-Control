/* ==========================================================================
   PWA: registro del Service Worker + botón "Instalar app" + aviso de
   "hay una actualización disponible". Un solo archivo, compartido por
   login.html, index.html y cliente.html (se agrega con <script defer>).
   ========================================================================== */
(() => {
  if (!('serviceWorker' in navigator)) return;

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
    installBtn = document.createElement('button');
    installBtn.textContent = '⬇ Instalar app';
    installBtn.setAttribute('aria-label', 'Instalar la aplicación');
    Object.assign(installBtn.style, {
      position: 'fixed', right: '16px', bottom: '16px', zIndex: 9999,
      padding: '10px 18px', borderRadius: '999px', border: 'none',
      background: '#0d6efd', color: '#fff', fontWeight: '700',
      boxShadow: '0 4px 14px rgba(0,0,0,.25)', cursor: 'pointer', fontSize: '14px'
    });
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
    const toast = document.createElement('button');
    toast.textContent = '🔄 Hay una actualización — toca para recargar';
    Object.assign(toast.style, {
      position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: '16px',
      zIndex: 9999, padding: '10px 18px', borderRadius: '999px', border: 'none',
      background: '#198754', color: '#fff', fontWeight: '700',
      boxShadow: '0 4px 14px rgba(0,0,0,.25)', cursor: 'pointer', fontSize: '13px'
    });
    toast.addEventListener('click', () => {
      toast.textContent = 'Actualizando…';
      toast.disabled = true;
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

// ============================================================
// Catering Control · app.js
// Fusión de supabase-client.js + pwa-register.js para reducir
// la cantidad de archivos JS servidos. config.js queda SEPARADO
// a propósito: es el único archivo que se edita por cliente en
// cada despliegue white-label (nombre, logo, WhatsApp, credenciales
// de Supabase), y conviene que sea fácil de encontrar y tocar solo.
// Requiere, en este orden, ANTES de este archivo:
//   1) ./config.js
//   2) https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
// ============================================================

// ---------- supabase-client.js ----------
(() => {
  const SUPABASE_URL = window.APP_CONFIG?.supabaseUrl;
  const SUPABASE_KEY = window.APP_CONFIG?.supabaseKey;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[supabase] Falta config.js (o supabaseUrl/supabaseKey) antes de supabase-client.js.');
    return;
  }

  if (!window.supabase || !window.supabase.createClient) {
    console.error('[supabase] No se cargó la librería @supabase/supabase-js. Revisa tu conexión a internet.');
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // --- Token de sesión --------------------------------------------------
  // Desde el cierre de seguridad, TODAS las tablas db_* tienen RLS
  // `using (false)` -- ya no se puede leer/escribir nada por REST directo
  // con la sola clave publishable. Todo pasa por funciones RPC
  // `security definer` que reciben este token y lo validan contra
  // db_sessions antes de tocar cualquier tabla.
  //
  // login.html llama a setSessionToken(token, 'staff'|'cliente') apenas
  // login_staff/login_cliente devuelven session_token, y lo guarda en
  // sessionStorage junto con el resto de la sesión. index.html/
  // cliente.html vuelven a llamar setSessionToken() al arrancar, leyendo
  // ese mismo valor de sessionStorage (sessionStorage sobrevive a un
  // F5, pero no a cerrar la pestaña -- igual que el resto de la sesión).
  let currentToken = null;
  let currentTokenType = null; // 'staff' | 'cliente'

  function setSessionToken(token, type) {
    currentToken = token || null;
    currentTokenType = token ? (type || null) : null;
  }
  function getSessionToken() {
    return currentToken;
  }
  async function revokeSession() {
    if (!currentToken) return true;
    try {
      await client.rpc('revoke_session', { p_token: currentToken });
    } catch (_) { /* best-effort: si falla, la sesión igual expira sola a los 30 días */ }
    setSessionToken(null, null);
    return true;
  }

  const DB_TABLE_KEYS = ['clientes', 'personal', 'inventario'];

  async function dbGet(tableKey) {
    if (!DB_TABLE_KEYS.includes(tableKey)) return null;
    try {
      const { data, error } = await client.rpc('staff_get_block', { p_token: currentToken, p_table_key: tableKey });
      if (error) { console.error(`[supabase] Error leyendo ${tableKey}:`, error.message); return null; }
      return data ?? null;
    } catch (err) {
      console.error(`[supabase] Fallo de red leyendo ${tableKey}:`, err);
      return null;
    }
  }

  async function dbSet(tableKey, payload) {
    if (!DB_TABLE_KEYS.includes(tableKey)) return false;
    try {
      const { error } = await client.rpc('staff_set_block', { p_token: currentToken, p_table_key: tableKey, p_payload: payload });
      if (error) { console.error(`[supabase] Error guardando ${tableKey}:`, error.message); return false; }
      return true;
    } catch (err) {
      console.error(`[supabase] Fallo de red guardando ${tableKey}:`, err);
      return false;
    }
  }

  // dbGetFields/dbSetFields: variante "por campo" de dbGet/dbSet -- ver
  // comentario original, sigue igual de afuera, ahora pasa por RPC.
  async function dbGetFields(tableKey, ids) {
    if (!DB_TABLE_KEYS.includes(tableKey)) return null;
    if (!ids || !ids.length) return {};
    try {
      const { data, error } = await client.rpc('staff_get_fields', { p_token: currentToken, p_table_key: tableKey, p_ids: ids });
      if (error) { console.error(`[supabase] Error leyendo campos de ${tableKey}:`, error.message); return null; }
      const result = {};
      (data || []).forEach(r => { result[r.id] = r.payload; });
      return result;
    } catch (err) {
      console.error(`[supabase] Fallo de red leyendo campos de ${tableKey}:`, err);
      return null;
    }
  }

  async function dbSetFields(tableKey, fieldsObj) {
    if (!DB_TABLE_KEYS.includes(tableKey)) return false;
    const ids = Object.keys(fieldsObj || {});
    if (!ids.length) return true;
    try {
      const { error } = await client.rpc('staff_set_fields', { p_token: currentToken, p_table_key: tableKey, p_fields: fieldsObj });
      if (error) { console.error(`[supabase] Error guardando campos de ${tableKey}:`, error.message); return false; }
      return true;
    } catch (err) {
      console.error(`[supabase] Fallo de red guardando campos de ${tableKey}:`, err);
      return false;
    }
  }

  async function rpc(fnName, params) {
    try {
      const { data, error } = await client.rpc(fnName, params);
      if (error) { console.error(`[supabase] Error llamando a ${fnName}:`, error.message); return null; }
      return data;
    } catch (err) {
      console.error(`[supabase] Fallo de red llamando a ${fnName}:`, err);
      return null;
    }
  }

  // Catálogo público del portal (plans/days/currentDate) -- no requiere
  // sesión, mismo criterio que get_branding().
  async function getPortalCatalog() {
    try {
      const { data, error } = await client.rpc('get_portal_catalog', {});
      if (error) { console.error('[supabase] Error leyendo catálogo del portal:', error.message); return null; }
      return data ?? null;
    } catch (err) {
      console.error('[supabase] Fallo de red leyendo catálogo del portal:', err);
      return null;
    }
  }

  async function dbGetClientRows() {
    try {
      const { data, error } = await client.rpc('staff_get_client_rows', { p_token: currentToken });
      if (error) { console.error('[supabase] Error leyendo db_clientes_rows:', error.message); return null; }
      return (data || []).map(r => ({ ...r.payload, id: r.id }));
    } catch (err) {
      console.error('[supabase] Fallo de red leyendo db_clientes_rows:', err);
      return null;
    }
  }

  async function dbGetClientRowIds() {
    try {
      const { data, error } = await client.rpc('staff_get_client_row_ids', { p_token: currentToken });
      if (error) { console.error('[supabase] Error leyendo ids de db_clientes_rows:', error.message); return null; }
      return (data || []).map(r => r.id);
    } catch (err) {
      console.error('[supabase] Fallo de red leyendo ids de db_clientes_rows:', err);
      return null;
    }
  }

  async function dbGetClientRowsSince(sinceISO) {
    try {
      const { data, error } = await client.rpc('staff_get_client_rows_since', { p_token: currentToken, p_since: sinceISO });
      if (error) { console.error('[supabase] Error leyendo cambios de db_clientes_rows:', error.message); return null; }
      return (data || []).map(r => ({ ...r.payload, id: r.id }));
    } catch (err) {
      console.error('[supabase] Fallo de red leyendo cambios de db_clientes_rows:', err);
      return null;
    }
  }

  async function dbUpsertClientRows(clientsArray) {
    if (!clientsArray || !clientsArray.length) return true;
    try {
      const rows = clientsArray.map(c => ({ ...c, id: c.id }));
      const { error } = await client.rpc('staff_upsert_client_rows', { p_token: currentToken, p_rows: rows });
      if (error) { console.error('[supabase] Error guardando db_clientes_rows:', error.message); return false; }
      return true;
    } catch (err) {
      console.error('[supabase] Fallo de red guardando db_clientes_rows:', err);
      return false;
    }
  }

  async function dbDeleteClientRows(ids) {
    if (!ids || !ids.length) return true;
    try {
      const { error } = await client.rpc('staff_delete_client_rows', { p_token: currentToken, p_ids: ids });
      if (error) { console.error('[supabase] Error borrando db_clientes_rows:', error.message); return false; }
      return true;
    } catch (err) {
      console.error('[supabase] Fallo de red borrando db_clientes_rows:', err);
      return false;
    }
  }

  // dbGetClientRow: la usan TANTO index.html (staff, cualquier cliente)
  // COMO cliente.html (portal, solo su propia fila) -- se resuelve solo
  // según qué tipo de sesión hay activa.
  async function dbGetClientRow(id) {
    try {
      const fnName = currentTokenType === 'cliente' ? 'cliente_get_own_profile' : 'staff_get_client_row';
      const params = currentTokenType === 'cliente'
        ? { p_token: currentToken, p_client_id: id }
        : { p_token: currentToken, p_id: id };
      const { data, error } = await client.rpc(fnName, params);
      if (error) { console.error('[supabase] Error leyendo db_clientes_rows:', error.message); return null; }
      const r = Array.isArray(data) ? data[0] : null;
      return r ? { ...r.payload, id: r.id } : null;
    } catch (err) {
      console.error('[supabase] Fallo de red leyendo db_clientes_rows:', err);
      return null;
    }
  }

  // Guardado del PROPIO perfil desde el portal cliente (pausa/reactivación/
  // dirección habitual). Server-side solo se permiten estos campos --
  // aunque el objeto que mandes traiga carnet/phone/price/plan, se
  // ignoran. Reemplaza al viejo uso de dbUpsertClientRows desde el portal.
  async function dbSaveOwnClientProfile(clientId, updates) {
    try {
      const { error } = await client.rpc('cliente_save_profile', { p_token: currentToken, p_client_id: clientId, p_updates: updates });
      if (error) { console.error('[supabase] Error guardando el perfil del cliente:', error.message); return false; }
      return true;
    } catch (err) {
      console.error('[supabase] Fallo de red guardando el perfil del cliente:', err);
      return false;
    }
  }

  // dbInsertAudit: la llaman tanto index.html (staff) como cliente.html
  // (portal, autoservicio de pausa/reactivación/dirección) -- se resuelve
  // según el tipo de sesión activa. El actor (id/nombre/rol) SIEMPRE lo
  // fuerza el servidor desde la sesión, nunca lo que venga en `entry`.
  async function dbInsertAudit(entry) {
    try {
      if (currentTokenType === 'cliente') {
        const { error } = await client.rpc('cliente_insert_audit', { p_token: currentToken, p_client_id: entry?.actor_id, p_entry: entry });
        if (error) { console.error('[supabase] Error guardando en el historial:', error.message); return false; }
        return true;
      }
      const { error } = await client.rpc('staff_insert_audit', { p_token: currentToken, p_entry: entry });
      if (error) { console.error('[supabase] Error guardando en el historial:', error.message); return false; }
      return true;
    } catch (err) {
      console.error('[supabase] Fallo de red guardando en el historial:', err);
      return false;
    }
  }

  async function dbGetAuditLog(limit = 200) {
    try {
      const { data, error } = await client.rpc('staff_get_audit_log', { p_token: currentToken, p_limit: limit });
      if (error) { console.error('[supabase] Error leyendo el historial:', error.message); return null; }
      return data || [];
    } catch (err) {
      console.error('[supabase] Fallo de red leyendo el historial:', err);
      return null;
    }
  }

  async function dbGetAllAuditLog(sinceDate) {
    try {
      const { data, error } = await client.rpc('staff_get_all_audit_log', { p_token: currentToken, p_since: sinceDate || null });
      if (error) { console.error('[supabase] Error leyendo historial completo:', error.message); return null; }
      return data || [];
    } catch (err) {
      console.error('[supabase] Fallo de red leyendo historial completo:', err);
      return null;
    }
  }

  async function dbInsertAuditBulk(entries) {
    if (!entries || !entries.length) return true;
    try {
      const cleanEntries = entries.map(({ id, ...rest }) => rest);
      const { error } = await client.rpc('staff_insert_audit_bulk', { p_token: currentToken, p_entries: cleanEntries });
      if (error) { console.error('[supabase] Error restaurando historial:', error.message); return false; }
      return true;
    } catch (err) {
      console.error('[supabase] Fallo de red restaurando historial:', err);
      return false;
    }
  }

  async function dbGetNoteRows() {
    try {
      const { data, error } = await client.rpc('staff_get_note_rows', { p_token: currentToken });
      if (error) { console.error('[supabase] Error leyendo db_notas_rows:', error.message); return null; }
      return (data || []).map(r => ({ ...r.payload, id: r.id }));
    } catch (err) {
      console.error('[supabase] Fallo de red leyendo db_notas_rows:', err);
      return null;
    }
  }

  async function dbUpsertNoteRows(notesArray) {
    if (!notesArray || !notesArray.length) return true;
    try {
      const rows = notesArray.map(nt => ({ ...nt, id: nt.id }));
      const { error } = await client.rpc('staff_upsert_note_rows', { p_token: currentToken, p_rows: rows });
      if (error) { console.error('[supabase] Error guardando db_notas_rows:', error.message); return false; }
      return true;
    } catch (err) {
      console.error('[supabase] Fallo de red guardando db_notas_rows:', err);
      return false;
    }
  }

  async function dbDeleteNoteRows(ids) {
    if (!ids || !ids.length) return true;
    try {
      const { error } = await client.rpc('staff_delete_note_rows', { p_token: currentToken, p_ids: ids });
      if (error) { console.error('[supabase] Error borrando db_notas_rows:', error.message); return false; }
      return true;
    } catch (err) {
      console.error('[supabase] Fallo de red borrando db_notas_rows:', err);
      return false;
    }
  }

  async function dbUpsertSnapshot(date, payload) {
    try {
      const { error } = await client.rpc('staff_upsert_snapshot', { p_token: currentToken, p_date: date, p_payload: payload });
      if (error) { console.error('[supabase] Error guardando snapshot del día:', error.message); return false; }
      return true;
    } catch (err) {
      console.error('[supabase] Fallo de red guardando snapshot del día:', err);
      return false;
    }
  }

  async function dbGetSnapshot(date) {
    try {
      const { data, error } = await client.rpc('staff_get_snapshot', { p_token: currentToken, p_date: date });
      if (error) { console.error('[supabase] Error leyendo snapshot del día:', error.message); return null; }
      return Array.isArray(data) ? (data[0] || null) : (data || null);
    } catch (err) {
      console.error('[supabase] Fallo de red leyendo snapshot del día:', err);
      return null;
    }
  }

  async function dbListSnapshotDates() {
    try {
      const { data, error } = await client.rpc('staff_list_snapshot_dates', { p_token: currentToken });
      if (error) { console.error('[supabase] Error listando snapshots:', error.message); return null; }
      return data || [];
    } catch (err) {
      console.error('[supabase] Fallo de red listando snapshots:', err);
      return null;
    }
  }

  async function dbGetDeliveryRows(date) {
    try {
      const { data, error } = await client.rpc('staff_get_delivery_rows', { p_token: currentToken, p_date: date });
      if (error) { console.error('[supabase] Error leyendo db_delivery_status:', error.message); return null; }
      return (data || []).map(r => ({ id: r.id, clientId: r.client_id, ...r.payload }));
    } catch (err) {
      console.error('[supabase] Fallo de red leyendo db_delivery_status:', err);
      return null;
    }
  }

  async function dbUpsertDeliveryRows(rows) {
    if (!rows || !rows.length) return true;
    try {
      const upsertRows = rows.map(r => ({ date: r.date, clientId: r.clientId, payload: r.payload }));
      const { error } = await client.rpc('staff_upsert_delivery_rows', { p_token: currentToken, p_rows: upsertRows });
      if (error) { console.error('[supabase] Error guardando db_delivery_status:', error.message); return false; }
      return true;
    } catch (err) {
      console.error('[supabase] Fallo de red guardando db_delivery_status:', err);
      return false;
    }
  }

  async function dbGetAllDeliveryStatus(sinceDate) {
    try {
      const { data, error } = await client.rpc('staff_get_all_delivery_status', { p_token: currentToken, p_since: sinceDate || null });
      if (error) { console.error('[supabase] Error leyendo todo db_delivery_status:', error.message); return null; }
      return (data || []).map(r => ({ date: r.date, clientId: r.client_id, payload: r.payload }));
    } catch (err) {
      console.error('[supabase] Fallo de red leyendo todo db_delivery_status:', err);
      return null;
    }
  }

  async function dbGetAllSnapshots(sinceDate) {
    try {
      const { data, error } = await client.rpc('staff_get_all_snapshots', { p_token: currentToken, p_since: sinceDate || null });
      if (error) { console.error('[supabase] Error leyendo todos los snapshots:', error.message); return null; }
      return data || [];
    } catch (err) {
      console.error('[supabase] Fallo de red leyendo todos los snapshots:', err);
      return null;
    }
  }

  async function dbUpsertSnapshotsBulk(snapshotsArray) {
    if (!snapshotsArray || !snapshotsArray.length) return true;
    try {
      const { error } = await client.rpc('staff_upsert_snapshots_bulk', { p_token: currentToken, p_snapshots: snapshotsArray });
      if (error) { console.error('[supabase] Error restaurando snapshots:', error.message); return false; }
      return true;
    } catch (err) {
      console.error('[supabase] Fallo de red restaurando snapshots:', err);
      return false;
    }
  }

  // --- Presencia en línea (sin cambios: no toca ninguna tabla db_*) ------
  let presenceChannel = null;
  function joinPresence(info, onChange) {
    try {
      if (presenceChannel) return presenceChannel;
      const sessionId = `${info.role}-${info.id || 'anon'}-${Math.random().toString(36).slice(2, 9)}`;
      presenceChannel = client.channel('catering-online-users', { config: { presence: { key: sessionId } } });
      if (typeof onChange === 'function') {
        presenceChannel.on('presence', { event: 'sync' }, () => {
          try { onChange(presenceChannel.presenceState()); } catch (_) {}
        });
      }
      presenceChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try { await presenceChannel.track({ role: info.role, name: info.name || '' }); } catch (_) {}
        }
      });
      return presenceChannel;
    } catch (err) {
      console.error('[supabase] Error uniéndose al canal de presencia:', err);
      return null;
    }
  }
  function presenceState() {
    try { return presenceChannel ? presenceChannel.presenceState() : {}; }
    catch (_) { return {}; }
  }

  // --- Storage de imágenes -------------------------------------------
  // NOTA DE SEGURIDAD (pendiente, alcance separado): el bucket app-images
  // sigue con subir/reemplazar/borrar abiertos a la anon key (ver
  // supabase-storage-setup.sql). Es un riesgo menor -- imágenes, no datos
  // de clientes ni contraseñas -- pero no quedó cerrado en este cambio.
  const IMAGES_BUCKET = 'app-images';

  async function storageUploadImage(path, blob, contentType) {
    try {
      const { error } = await client.storage.from(IMAGES_BUCKET).upload(path, blob, { contentType, upsert: true, cacheControl: '604800' });
      if (error) { console.error('[supabase] Error subiendo imagen:', error.message); return null; }
      const { data } = client.storage.from(IMAGES_BUCKET).getPublicUrl(path);
      return data?.publicUrl || null;
    } catch (err) {
      console.error('[supabase] Fallo de red subiendo imagen:', err);
      return null;
    }
  }

  async function storageRemoveImage(path) {
    if (!path) return true;
    try {
      const { error } = await client.storage.from(IMAGES_BUCKET).remove([path]);
      if (error) { console.error('[supabase] Error borrando imagen:', error.message); return false; }
      return true;
    } catch (err) {
      console.error('[supabase] Fallo de red borrando imagen:', err);
      return false;
    }
  }

  window.SupabaseDB = {
    setSessionToken, getSessionToken, revokeSession,
    dbGet, dbSet, dbGetFields, dbSetFields, rpc, getPortalCatalog,
    dbGetClientRows, dbGetClientRowIds, dbGetClientRowsSince, dbUpsertClientRows,
    dbDeleteClientRows, dbGetClientRow, dbSaveOwnClientProfile,
    dbInsertAudit, dbGetAuditLog, dbGetAllAuditLog, dbInsertAuditBulk,
    dbGetNoteRows, dbUpsertNoteRows, dbDeleteNoteRows,
    dbUpsertSnapshot, dbGetSnapshot, dbListSnapshotDates, dbGetAllSnapshots, dbUpsertSnapshotsBulk,
    dbGetDeliveryRows, dbUpsertDeliveryRows, dbGetAllDeliveryStatus,
    joinPresence, presenceState, storageUploadImage, storageRemoveImage, IMAGES_BUCKET, client
  };
})();

// ---------- pwa-register.js ----------
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

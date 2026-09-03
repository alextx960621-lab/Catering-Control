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

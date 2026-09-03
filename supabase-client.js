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

  const DB_TABLES = {
    clientes: 'db_clientes',
    personal: 'db_personal',
    inventario: 'db_inventario'
  };

  async function dbGet(tableKey) {
    const table = DB_TABLES[tableKey];
    try {
      const { data, error } = await client.from(table).select('payload').eq('id', 'main').maybeSingle();
      if (error) { console.error(`[supabase] Error leyendo ${table}:`, error.message); return null; }
      return data?.payload ?? null;
    } catch (err) {
      console.error(`[supabase] Fallo de red leyendo ${table}:`, err);
      return null;
    }
  }

  async function dbSet(tableKey, payload) {
    const table = DB_TABLES[tableKey];
    try {
      const { error } = await client
        .from(table)
        .upsert({ id: 'main', payload, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (error) { console.error(`[supabase] Error guardando ${table}:`, error.message); return false; }
      return true;
    } catch (err) {
      console.error(`[supabase] Fallo de red guardando ${table}:`, err);
      return false;
    }
  }

  // dbGetFields/dbSetFields: variante "por campo" de dbGet/dbSet. En vez de
  // guardar todo el bloque (clientes/personal/inventario) en una sola fila
  // id='main', cada campo top-level (plans, days, drivers, settings...)
  // vive en su propia fila (id=nombre del campo) dentro de la misma tabla.
  // Así save() puede leer/escribir solo el campito que cambió, sin bajar
  // ni subir el bloque entero cada vez. No requiere migración de esquema:
  // las tablas db_clientes/db_personal/db_inventario ya son id/payload/
  // updated_at: 'main' simplemente deja de usarse para escritura nueva
  // (queda como respaldo legado para migrar cuentas viejas, ver
  // loadFromServer en index.html).
  async function dbGetFields(tableKey, ids) {
    const table = DB_TABLES[tableKey];
    if (!ids || !ids.length) return {};
    try {
      const { data, error } = await client.from(table).select('id,payload').in('id', ids);
      if (error) { console.error(`[supabase] Error leyendo campos de ${table}:`, error.message); return null; }
      const result = {};
      (data || []).forEach(r => { result[r.id] = r.payload; });
      return result;
    } catch (err) {
      console.error(`[supabase] Fallo de red leyendo campos de ${table}:`, err);
      return null;
    }
  }

  async function dbSetFields(tableKey, fieldsObj) {
    const table = DB_TABLES[tableKey];
    const ids = Object.keys(fieldsObj || {});
    if (!ids.length) return true;
    try {
      const rows = ids.map(id => ({ id, payload: fieldsObj[id], updated_at: new Date().toISOString() }));
      const { error } = await client.from(table).upsert(rows, { onConflict: 'id' });
      if (error) { console.error(`[supabase] Error guardando campos de ${table}:`, error.message); return false; }
      return true;
    } catch (err) {
      console.error(`[supabase] Fallo de red guardando campos de ${table}:`, err);
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

  async function dbGetClientRows() {
    try {
      const { data, error } = await client.from('db_clientes_rows').select('id,payload');
      if (error) { console.error('[supabase] Error leyendo db_clientes_rows:', error.message); return null; }
      return (data || []).map(r => ({ ...r.payload, id: r.id }));
    } catch (err) {
      console.error('[supabase] Fallo de red leyendo db_clientes_rows:', err);
      return null;
    }
  }

  async function dbUpsertClientRows(clientsArray) {
    if (!clientsArray || !clientsArray.length) return true;
    try {
      const rows = clientsArray.map(c => ({ id: c.id, payload: c, updated_at: new Date().toISOString() }));
      const { error } = await client.from('db_clientes_rows').upsert(rows, { onConflict: 'id' });
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
      const { error } = await client.from('db_clientes_rows').delete().in('id', ids);
      if (error) { console.error('[supabase] Error borrando db_clientes_rows:', error.message); return false; }
      return true;
    } catch (err) {
      console.error('[supabase] Fallo de red borrando db_clientes_rows:', err);
      return false;
    }
  }

  async function dbGetClientRow(id) {
    try {
      const { data, error } = await client.from('db_clientes_rows').select('id,payload').eq('id', id).maybeSingle();
      if (error) { console.error('[supabase] Error leyendo db_clientes_rows:', error.message); return null; }
      return data ? { ...data.payload, id: data.id } : null;
    } catch (err) {
      console.error('[supabase] Fallo de red leyendo db_clientes_rows:', err);
      return null;
    }
  }

  async function dbInsertAudit(entry) {
    try {
      const { error } = await client.from('db_audit_log').insert(entry);
      if (error) { console.error('[supabase] Error guardando en el historial:', error.message); return false; }
      return true;
    } catch (err) {
      console.error('[supabase] Fallo de red guardando en el historial:', err);
      return false;
    }
  }

  async function dbGetAuditLog(limit = 200) {
    try {
      const { data, error } = await client.from('db_audit_log').select('*').order('at', { ascending: false }).limit(limit);
      if (error) { console.error('[supabase] Error leyendo el historial:', error.message); return null; }
      return data || [];
    } catch (err) {
      console.error('[supabase] Fallo de red leyendo el historial:', err);
      return null;
    }
  }

  async function dbGetNoteRows() {
    try {
      const { data, error } = await client.from('db_notas_rows').select('id,payload');
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
      const rows = notesArray.map(nt => ({ id: nt.id, payload: nt, updated_at: new Date().toISOString() }));
      const { error } = await client.from('db_notas_rows').upsert(rows, { onConflict: 'id' });
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
      const { error } = await client.from('db_notas_rows').delete().in('id', ids);
      if (error) { console.error('[supabase] Error borrando db_notas_rows:', error.message); return false; }
      return true;
    } catch (err) {
      console.error('[supabase] Fallo de red borrando db_notas_rows:', err);
      return false;
    }
  }

  async function dbUpsertSnapshot(date, payload) {
    try {
      const { error } = await client
        .from('db_dispatch_snapshots')
        .upsert({ date, payload, created_at: new Date().toISOString() }, { onConflict: 'date' });
      if (error) { console.error('[supabase] Error guardando snapshot del día:', error.message); return false; }
      return true;
    } catch (err) {
      console.error('[supabase] Fallo de red guardando snapshot del día:', err);
      return false;
    }
  }

  async function dbGetSnapshot(date) {
    try {
      const { data, error } = await client.from('db_dispatch_snapshots').select('date,payload,created_at').eq('date', date).maybeSingle();
      if (error) { console.error('[supabase] Error leyendo snapshot del día:', error.message); return null; }
      return data || null;
    } catch (err) {
      console.error('[supabase] Fallo de red leyendo snapshot del día:', err);
      return null;
    }
  }

  async function dbListSnapshotDates() {
    try {
      const { data, error } = await client.from('db_dispatch_snapshots').select('date,created_at').order('date', { ascending: false });
      if (error) { console.error('[supabase] Error listando snapshots:', error.message); return null; }
      return data || [];
    } catch (err) {
      console.error('[supabase] Fallo de red listando snapshots:', err);
      return null;
    }
  }

  async function dbGetDeliveryRows(date) {
    try {
      const { data, error } = await client.from('db_delivery_status').select('id,client_id,payload').eq('date', date);
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
      const upsertRows = rows.map(r => ({ id: `${r.date}_${r.clientId}`, date: r.date, client_id: r.clientId, payload: r.payload, updated_at: new Date().toISOString() }));
      const { error } = await client.from('db_delivery_status').upsert(upsertRows, { onConflict: 'id' });
      if (error) { console.error('[supabase] Error guardando db_delivery_status:', error.message); return false; }
      return true;
    } catch (err) {
      console.error('[supabase] Fallo de red guardando db_delivery_status:', err);
      return false;
    }
  }

  async function dbGetAllAuditLog(sinceDate) {
    try {
      let q = client.from('db_audit_log').select('*').order('at', { ascending: false });
      if (sinceDate) q = q.gte('at', sinceDate);
      const { data, error } = await q;
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
      // La columna "id" de db_audit_log es autogenerada (identity) en Supabase
      // y rechaza cualquier insert que la incluya explícitamente (aunque venga
      // de un respaldo JSON exportado previamente). La quitamos antes de enviar.
      const cleanEntries = entries.map(({ id, ...rest }) => rest);
      const { error } = await client.from('db_audit_log').insert(cleanEntries);
      if (error) { console.error('[supabase] Error restaurando historial:', error.message); return false; }
      return true;
    } catch (err) {
      console.error('[supabase] Fallo de red restaurando historial:', err);
      return false;
    }
  }

  async function dbGetAllDeliveryStatus(sinceDate) {
    try {
      let q = client.from('db_delivery_status').select('date,client_id,payload');
      if (sinceDate) q = q.gte('date', sinceDate);
      const { data, error } = await q;
      if (error) { console.error('[supabase] Error leyendo todo db_delivery_status:', error.message); return null; }
      return (data || []).map(r => ({ date: r.date, clientId: r.client_id, payload: r.payload }));
    } catch (err) {
      console.error('[supabase] Fallo de red leyendo todo db_delivery_status:', err);
      return null;
    }
  }

  async function dbGetAllSnapshots(sinceDate) {
    try {
      let q = client.from('db_dispatch_snapshots').select('date,payload');
      if (sinceDate) q = q.gte('date', sinceDate);
      const { data, error } = await q;
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
      const rows = snapshotsArray.map(s => ({ date: s.date, payload: s.payload, created_at: new Date().toISOString() }));
      const { error } = await client.from('db_dispatch_snapshots').upsert(rows, { onConflict: 'date' });
      if (error) { console.error('[supabase] Error restaurando snapshots:', error.message); return false; }
      return true;
    } catch (err) {
      console.error('[supabase] Fallo de red restaurando snapshots:', err);
      return false;
    }
  }

  // --- Presencia en línea (contador de "personas conectadas ahora") ---
  // Usa un canal de Supabase Realtime (Presence). No requiere ninguna tabla:
  // cada pestaña abierta se anuncia a sí misma y desaparece sola al cerrarse
  // o perder conexión. Requiere que Realtime esté habilitado en el proyecto
  // (viene habilitado por defecto).
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

  // --- Storage de imágenes (logo, fotos de drivers/planes, íconos de menú,
  // fotos de respaldo de entrega). Antes viajaban como base64 pegadas en las
  // filas de Postgres (se re-descargaban enteras en cada lectura de esas
  // filas); ahora se suben como archivo al bucket "app-images" y en la fila
  // solo queda guardada la URL pública. Requiere haber corrido
  // supabase-storage-setup.sql una vez en el proyecto.
  const IMAGES_BUCKET = 'app-images';

  async function storageUploadImage(path, blob, contentType) {
    try {
      // cacheControl largo: son fotos que casi no cambian (logo, driver,
      // plan...), así que el navegador las cachea y no las vuelve a pedir
      // en cada visita -- eso es egress que ya no se gasta.
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

  window.SupabaseDB = { dbGet, dbSet, dbGetFields, dbSetFields, rpc, dbGetClientRows, dbUpsertClientRows, dbDeleteClientRows, dbGetClientRow, dbInsertAudit, dbGetAuditLog, dbGetAllAuditLog, dbInsertAuditBulk, dbGetNoteRows, dbUpsertNoteRows, dbDeleteNoteRows, dbUpsertSnapshot, dbGetSnapshot, dbListSnapshotDates, dbGetAllSnapshots, dbUpsertSnapshotsBulk, dbGetDeliveryRows, dbUpsertDeliveryRows, dbGetAllDeliveryStatus, joinPresence, presenceState, storageUploadImage, storageRemoveImage, IMAGES_BUCKET, client };
})();

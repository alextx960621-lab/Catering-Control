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

  window.SupabaseDB = { dbGet, dbSet, rpc, dbGetClientRows, dbUpsertClientRows, dbDeleteClientRows, dbGetClientRow, dbInsertAudit, dbGetAuditLog, dbGetNoteRows, dbUpsertNoteRows, dbDeleteNoteRows, dbUpsertSnapshot, dbGetSnapshot, dbListSnapshotDates, dbGetDeliveryRows, dbUpsertDeliveryRows, client };
})();

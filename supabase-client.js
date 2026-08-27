/* ==========================================================================
   CONEXIÓN A SUPABASE (compartida por login.html, index.html y cliente.html)
   No necesitas tocar este archivo salvo que cambies de proyecto de Supabase.
   ========================================================================== */
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

  // Tres "bases de datos" (tablas) separadas, tal como se pidió:
  // una para clientes, otra para personal (usuarios/drivers/rutas) y otra para inventario.
  const DB_TABLES = {
    clientes: 'db_clientes',
    personal: 'db_personal',
    inventario: 'db_inventario'
  };

  // Lee el bloque de datos ('payload') guardado para una de las 3 bases.
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

  // Guarda (upsert) el bloque de datos completo de una de las 3 bases.
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

  // Llama a una función (RPC) creada en Supabase — se usa para el login de
  // clientes y de staff, para que la verificación de carnet/teléfono/contraseña
  // ocurra en el servidor y nunca haga falta descargar toda la tabla al navegador.
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

  // ------------------------------------------------------------------------
  // db_clientes_rows: UNA FILA POR CLIENTE (en vez de un solo bloque con
  // todos los clientes adentro, como las otras 3 bases). Con esto, guardar
  // un cambio en un cliente ya no sube/baja la lista completa: solo esa fila.
  // ------------------------------------------------------------------------

  // Trae todos los clientes (cada uno como objeto plano, con su id).
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

  // Guarda (upsert) solo los clientes que cambiaron. Puede ser 1 o varios;
  // siempre es una sola llamada de red, sin importar cuántos sean.
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

  // Borra las filas de los clientes eliminados.
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

  // Trae solo la fila de un cliente puntual (mucho más liviano que traer
  // la lista completa, ideal para el portal de autoservicio del cliente).
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

  // ------------------------------------------------------------------------
  // db_audit_log: historial de cambios (quién hizo qué y cuándo). Es una
  // tabla de solo AGREGAR filas — cada evento es una fila nueva, nunca se
  // sobrescribe una fila con otra, así que no tiene el problema de
  // "un dispositivo desactualizado borra lo que guardó otro".
  // ------------------------------------------------------------------------

  // Agrega una fila al historial. No hace falta esperar a que termine para
  // seguir usando la app (se llama "en paralelo", sin bloquear al usuario).
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

  // Trae los últimos N eventos del historial, del más reciente al más viejo.
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

  // ------------------------------------------------------------------------
  // db_notas_rows: UNA FILA POR NOTA (mismo patrón que db_clientes_rows).
  // Acá viven tanto las notas que crea el staff (recordatorios propios)
  // como las que dejan los clientes desde su portal (RPC crear_nota_cliente,
  // ver supabase-notas-migration.sql).
  // ------------------------------------------------------------------------

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

  // ------------------------------------------------------------------------
  // db_dispatch_snapshots: UNA FILA POR FECHA con la "foto" completa de
  // cómo se veía el día al momento de tocar "Procesar día" (nombre,
  // teléfono, dirección, ruta, driver, plan, bolsas, dieta especial, etc.
  // ya resueltos, no IDs) — así el historial no cambia si después se edita
  // un cliente. Se borran solas a los 30 días vía pg_cron (ver
  // supabase-dispatch-snapshots-migration.sql), sin que el usuario haga nada.
  // ------------------------------------------------------------------------

  // Guarda (upsert) la foto del día. Se llama en paralelo al procesar el
  // día — no hace falta esperarla para seguir usando la app.
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

  // Trae la foto guardada de una fecha puntual (para importar/ver el historial).
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

  // Lista las fechas con foto guardada (para mostrar un selector de historial).
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

  window.SupabaseDB = { dbGet, dbSet, rpc, dbGetClientRows, dbUpsertClientRows, dbDeleteClientRows, dbGetClientRow, dbInsertAudit, dbGetAuditLog, dbGetNoteRows, dbUpsertNoteRows, dbDeleteNoteRows, dbUpsertSnapshot, dbGetSnapshot, dbListSnapshotDates, client };
})();

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

  window.SupabaseDB = { dbGet, dbSet, rpc, client };
})();

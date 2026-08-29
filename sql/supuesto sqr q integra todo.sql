-- =============================================================================
-- CATERING CONTROL · MIGRACIÓN COMPLETA (todas las tablas + funciones)
-- =============================================================================
-- Ejecuta este script UNA VEZ en el SQL Editor de tu proyecto de Supabase.
-- Es seguro repetirlo: no duplica tablas ni datos.
--
-- Incluye:
--   · Tablas: db_clientes, db_clientes_rows, db_personal, db_inventario,
--             db_audit_log, db_delivery_status, db_dispatch_snapshots,
--             db_notas_rows
--   · Funciones: login_cliente, login_staff, hash_password, get_branding,
--                get_plan_status, get_server_date, crear_nota_cliente
--   · Políticas RLS para acceso público (anon) y permisos de secuencias
--   · Migración de clientes existentes (desde db_clientes a db_clientes_rows)
--   · Limpieza automática con pg_cron (30 días para delivery_status y snapshots)
--
-- IMPORTANTE: Los scripts reset-admin-password.sql y promote-superadmin.sql
--             NO están incluidos porque requieren que tú elijas los valores
--             (contraseña/correo). Ejecútalos por separado cuando los necesites.
-- =============================================================================

SET search_path = public, extensions;

-- --------------------------------------------------------------------------
-- 1. Extensiones necesarias
-- --------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;   -- Si no tienes permisos para crearla,
                                          -- actívala desde Database → Extensions.

-- --------------------------------------------------------------------------
-- 2. Tablas principales
-- --------------------------------------------------------------------------

-- Tabla legada (respaldo / compatibilidad con código antiguo)
CREATE TABLE IF NOT EXISTS db_clientes (
  id         TEXT PRIMARY KEY DEFAULT 'main',
  payload    JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Clientes: UNA FILA POR CLIENTE (nueva estructura)
CREATE TABLE IF NOT EXISTS db_clientes_rows (
  id         TEXT PRIMARY KEY,
  payload    JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Personal (staff, drivers, rutas, settings)
CREATE TABLE IF NOT EXISTS db_personal (
  id         TEXT PRIMARY KEY DEFAULT 'main',
  payload    JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inventario
CREATE TABLE IF NOT EXISTS db_inventario (
  id         TEXT PRIMARY KEY DEFAULT 'main',
  payload    JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Historial de auditoría (solo INSERT)
CREATE TABLE IF NOT EXISTS db_audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id    TEXT,
  actor_name  TEXT,
  actor_role  TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_label TEXT,
  entity_id   TEXT,
  details     JSONB NOT NULL DEFAULT '{}'::JSONB
);

-- Estado de entregas (delivery_status)
CREATE TABLE IF NOT EXISTS public.db_delivery_status (
  id          TEXT PRIMARY KEY,          -- `${date}_${clientId}`
  date        DATE NOT NULL,
  client_id   TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Snapshots de "Procesar día"
CREATE TABLE IF NOT EXISTS public.db_dispatch_snapshots (
  date       DATE PRIMARY KEY,
  payload    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notas (una fila por nota)
CREATE TABLE IF NOT EXISTS db_notas_rows (
  id         TEXT PRIMARY KEY,
  payload    JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------------------------------------
-- 3. Índices para rendimiento
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS db_audit_log_at_idx          ON db_audit_log (at DESC);
CREATE INDEX IF NOT EXISTS db_delivery_status_date_idx  ON public.db_delivery_status (date);
CREATE INDEX IF NOT EXISTS db_delivery_status_client_idx ON public.db_delivery_status (client_id);

-- --------------------------------------------------------------------------
-- 4. RLS (Row Level Security) y políticas de acceso público
-- --------------------------------------------------------------------------
ALTER TABLE db_clientes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE db_clientes_rows       ENABLE ROW LEVEL SECURITY;
ALTER TABLE db_personal            ENABLE ROW LEVEL SECURITY;
ALTER TABLE db_inventario          ENABLE ROW LEVEL SECURITY;
ALTER TABLE db_audit_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.db_delivery_status   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.db_dispatch_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE db_notas_rows          ENABLE ROW LEVEL SECURITY;

-- Políticas: todas con acceso total para anon/authenticated (publishable key)
DO $$
BEGIN
  -- db_clientes
  DROP POLICY IF EXISTS "public access clientes" ON db_clientes;
  CREATE POLICY "public access clientes" ON db_clientes FOR ALL USING (TRUE) WITH CHECK (TRUE);

  -- db_clientes_rows
  DROP POLICY IF EXISTS "public access clientes filas" ON db_clientes_rows;
  CREATE POLICY "public access clientes filas" ON db_clientes_rows FOR ALL USING (TRUE) WITH CHECK (TRUE);

  -- db_personal
  DROP POLICY IF EXISTS "public access personal" ON db_personal;
  CREATE POLICY "public access personal" ON db_personal FOR ALL USING (TRUE) WITH CHECK (TRUE);

  -- db_inventario
  DROP POLICY IF EXISTS "public access inventario" ON db_inventario;
  CREATE POLICY "public access inventario" ON db_inventario FOR ALL USING (TRUE) WITH CHECK (TRUE);

  -- db_audit_log
  DROP POLICY IF EXISTS "public access audit log" ON db_audit_log;
  CREATE POLICY "public access audit log" ON db_audit_log FOR ALL USING (TRUE) WITH CHECK (TRUE);

  -- db_delivery_status
  DROP POLICY IF EXISTS "delivery_status_select" ON public.db_delivery_status;
  CREATE POLICY "delivery_status_select" ON public.db_delivery_status FOR SELECT TO anon, authenticated USING (TRUE);
  DROP POLICY IF EXISTS "delivery_status_upsert" ON public.db_delivery_status;
  CREATE POLICY "delivery_status_upsert" ON public.db_delivery_status FOR INSERT TO anon, authenticated WITH CHECK (TRUE);
  DROP POLICY IF EXISTS "delivery_status_update" ON public.db_delivery_status;
  CREATE POLICY "delivery_status_update" ON public.db_delivery_status FOR UPDATE TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);

  -- db_dispatch_snapshots
  DROP POLICY IF EXISTS "dispatch_snapshots_all" ON public.db_dispatch_snapshots;
  CREATE POLICY "dispatch_snapshots_all" ON public.db_dispatch_snapshots FOR ALL USING (TRUE) WITH CHECK (TRUE);

  -- db_notas_rows
  DROP POLICY IF EXISTS "notas_select" ON db_notas_rows;
  CREATE POLICY "notas_select" ON db_notas_rows FOR SELECT USING (TRUE);
  DROP POLICY IF EXISTS "notas_insert" ON db_notas_rows;
  CREATE POLICY "notas_insert" ON db_notas_rows FOR INSERT WITH CHECK (TRUE);
  DROP POLICY IF EXISTS "notas_update" ON db_notas_rows;
  CREATE POLICY "notas_update" ON db_notas_rows FOR UPDATE USING (TRUE) WITH CHECK (TRUE);
  DROP POLICY IF EXISTS "notas_delete" ON db_notas_rows;
  CREATE POLICY "notas_delete" ON db_notas_rows FOR DELETE USING (TRUE);
END $$;

-- Permisos adicionales para la secuencia de audit_log
GRANT SELECT, INSERT ON db_audit_log TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE db_audit_log_id_seq TO anon, authenticated;

-- --------------------------------------------------------------------------
-- 5. Funciones de login, hash, branding, plan, fecha servidor
-- --------------------------------------------------------------------------

-- Login de cliente (por carnet y teléfono)
CREATE OR REPLACE FUNCTION login_cliente(p_carnet TEXT, p_phone TEXT)
RETURNS TABLE(id TEXT, name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_phone TEXT := REGEXP_REPLACE(COALESCE(p_phone, ''), '\D', '', 'g');
BEGIN
  RETURN QUERY
  SELECT db_clientes_rows.id, payload ->> 'name'
  FROM db_clientes_rows
  WHERE LOWER(TRIM(COALESCE(payload ->> 'carnet', ''))) = LOWER(TRIM(COALESCE(p_carnet, '')))
    AND (REGEXP_REPLACE(COALESCE(payload ->> 'phone1', ''), '\D', '', 'g') = v_phone
         OR REGEXP_REPLACE(COALESCE(payload ->> 'phone2', ''), '\D', '', 'g') = v_phone)
  LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION login_cliente(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION login_cliente(TEXT, TEXT) TO anon, authenticated;

-- Login de staff (por email y contraseña con hash bcrypt)
CREATE OR REPLACE FUNCTION login_staff(p_email TEXT, p_password TEXT)
RETURNS TABLE(id TEXT, name TEXT, role TEXT, "routeId" TEXT, "driverId" TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_users JSONB;
BEGIN
  SELECT COALESCE(payload -> 'staffUsers', '[]'::JSONB) INTO v_users FROM db_personal WHERE db_personal.id = 'main';

  -- Si no hay usuarios registrados, permitir el acceso de emergencia (admin/admin123)
  IF v_users IS NULL OR JSONB_ARRAY_LENGTH(v_users) = 0 THEN
    IF LOWER(p_email) = 'admin@catering.local' AND p_password = 'admin123' THEN
      RETURN QUERY SELECT 'staff_admin'::TEXT, 'Administrador'::TEXT, 'admin'::TEXT, ''::TEXT, ''::TEXT;
    END IF;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u ->> 'id', u ->> 'name', u ->> 'role', u ->> 'routeId', u ->> 'driverId'
  FROM JSONB_ARRAY_ELEMENTS(v_users) AS u
  WHERE LOWER(u ->> 'email') = LOWER(p_email)
    AND u ->> 'passwordHash' IS NOT NULL
    AND CRYPT(p_password, u ->> 'passwordHash') = (u ->> 'passwordHash')
  LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION login_staff(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION login_staff(TEXT, TEXT) TO anon, authenticated;

-- Hash de contraseña (para crear/editar usuarios desde la app)
CREATE OR REPLACE FUNCTION hash_password(p_password TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT CRYPT(p_password, GEN_SALT('bf', 10));
$$;
REVOKE ALL ON FUNCTION hash_password(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hash_password(TEXT) TO anon, authenticated;

-- Branding público (solo settings, sin staffUsers ni drivers/routes)
CREATE OR REPLACE FUNCTION get_branding()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(payload -> 'settings', '{}'::JSONB)
  FROM db_personal
  WHERE id = 'main';
$$;
REVOKE ALL ON FUNCTION get_branding() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_branding() TO anon, authenticated;

-- Estado del plan (Premium/Básico) para portal de cliente
CREATE OR REPLACE FUNCTION public.get_plan_status()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT JSONB_BUILD_OBJECT(
    'plan', COALESCE(payload->'settings'->>'plan', 'basico')
  )
  FROM db_personal
  WHERE id = 'main';
$$;
GRANT EXECUTE ON FUNCTION public.get_plan_status() TO anon, authenticated;

-- Fecha del servidor (para evitar manipulación del reloj local)
CREATE OR REPLACE FUNCTION get_server_date()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT TO_CHAR(NOW() AT TIME ZONE 'utc', 'YYYY-MM-DD');
$$;
GRANT EXECUTE ON FUNCTION get_server_date() TO anon, authenticated;

-- --------------------------------------------------------------------------
-- 6. Función para que el cliente cree una nota desde su portal
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crear_nota_cliente(p_client_id TEXT, p_texto TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id          TEXT := 'n_' || SUBSTR(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), 1, 12);
  v_client_name TEXT;
BEGIN
  IF p_texto IS NULL OR LENGTH(TRIM(p_texto)) = 0 THEN
    RAISE EXCEPTION 'El mensaje no puede estar vacío';
  END IF;

  SELECT payload->>'name' INTO v_client_name
  FROM db_clientes_rows WHERE id = p_client_id;

  INSERT INTO db_notas_rows (id, payload, updated_at)
  VALUES (
    v_id,
    JSONB_BUILD_OBJECT(
      'text', TRIM(p_texto),
      'dueDate', TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD'),
      'status', 'pendiente',
      'source', 'cliente',
      'clientId', p_client_id,
      'clientName', COALESCE(v_client_name, ''),
      'createdAt', NOW(),
      'read', false
    ),
    NOW()
  );

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION crear_nota_cliente(TEXT, TEXT) TO anon;

-- --------------------------------------------------------------------------
-- 7. Datos iniciales (filas "main" para las tablas que los necesitan)
-- --------------------------------------------------------------------------
INSERT INTO db_clientes (id, payload) VALUES ('main', '{}'::JSONB) ON CONFLICT (id) DO NOTHING;
INSERT INTO db_personal (id, payload) VALUES ('main', '{}'::JSONB) ON CONFLICT (id) DO NOTHING;
INSERT INTO db_inventario (id, payload) VALUES ('main', '{}'::JSONB) ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------------------------------
-- 8. Migración de clientes existentes (si ya tienes datos en db_clientes)
--    Copia cada cliente a su propia fila en db_clientes_rows.
--    Si ya hay filas en db_clientes_rows, solo actualiza las que coincidan.
-- --------------------------------------------------------------------------
INSERT INTO db_clientes_rows (id, payload)
SELECT
  COALESCE(c ->> 'id', GEN_RANDOM_UUID()::TEXT) AS id,
  c AS payload
FROM db_clientes,
     JSONB_ARRAY_ELEMENTS(COALESCE(payload -> 'clients', '[]'::JSONB)) AS c
WHERE db_clientes.id = 'main'
ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW();

-- --------------------------------------------------------------------------
-- 9. Limpieza automática con pg_cron (borrar registros viejos)
--    Borra filas de db_delivery_status y db_dispatch_snapshots con más de 30 días.
--    Los jobs se ejecutan todos los días a las 01:00 (UTC) ≈ 21:00 hora Bolivia.
--    Si no tienes permisos para crear cron jobs, ignora los errores.
-- --------------------------------------------------------------------------
DO $$
BEGIN
  -- Programar limpieza para delivery_status
  PERFORM cron.schedule(
    'delivery-status-cleanup',
    '0 1 * * *',
    $$ DELETE FROM public.db_delivery_status WHERE date < (NOW() - INTERVAL '30 days')::DATE; $$
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'No se pudo programar cron para delivery_status (permisos insuficientes o pg_cron no habilitada).';
END $$;

DO $$
BEGIN
  -- Programar limpieza para dispatch_snapshots
  PERFORM cron.schedule(
    'delete-old-dispatch-snapshots',
    '0 1 * * *',
    $$ DELETE FROM public.db_dispatch_snapshots WHERE date < (CURRENT_DATE - INTERVAL '30 days'); $$
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'No se pudo programar cron para dispatch_snapshots (permisos insuficientes o pg_cron no habilitada).';
END $$;

-- =============================================================================
-- FIN DEL SCRIPT CONSOLIDADO
-- =============================================================================
-- Después de ejecutarlo, verifica que todo esté bien con:
--   SELECT * FROM db_personal;   -- debe existir la fila 'main'
--   SELECT * FROM db_clientes_rows LIMIT 5;
--   SELECT get_branding();
--   SELECT get_plan_status();
--
-- Para usar el acceso de emergencia (admin/admin123) o para cambiar la
-- contraseña, ejecuta por separado:
--   reset-admin-password.sql   (cambia 'PON-AQUI-TU-CONTRASEÑA-NUEVA')
--   promote-superadmin.sql     (cambia 'tu_correo@ejemplo.com')
-- =============================================================================
-- ==========================================================================
-- Catering Control · Migración: Historial de auditoría (quién cambió qué)
-- ==========================================================================
-- Por qué: con varios roles (admin, editor, cocina, driver) tocando los
-- mismos datos, no había forma de saber quién pausó a un cliente, quién
-- editó una ruta, o quién procesó un día. Esta tabla guarda un registro por
-- cada cambio importante: qué se hizo, sobre qué (cliente/driver/ruta/...),
-- quién lo hizo y cuándo.
--
-- A diferencia de db_clientes / db_personal / db_inventario (un solo bloque
-- que se sobrescribe entero en cada guardado), esta tabla es de solo
-- AGREGAR filas — cada evento es una fila nueva, nunca se pisa una fila con
-- otra. Por eso no tiene el problema de "un dispositivo desactualizado borra
-- lo que guardó otro" que tenían las otras tablas.
--
-- Corre este script UNA VEZ en el SQL Editor de tu proyecto de Supabase.
-- Es seguro volver a correrlo (usa "if not exists").
-- ==========================================================================

set search_path = public, extensions;

create table if not exists db_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id text,
  actor_name text,
  actor_role text,
  action text not null,
  entity_type text,
  entity_label text,
  entity_id text,
  details jsonb not null default '{}'::jsonb
);

-- Índice para que listar "los últimos N cambios" sea rápido incluso con
-- miles de filas acumuladas.
create index if not exists db_audit_log_at_idx on db_audit_log (at desc);

alter table db_audit_log enable row level security;

-- Misma política abierta que las demás tablas de este proyecto (para que
-- funcione con la publishable key tal como está armada la app hoy).
drop policy if exists "public access audit log" on db_audit_log;
create policy "public access audit log" on db_audit_log for all using (true) with check (true);

-- IMPORTANTE: la política RLS de arriba solo dice "qué filas puede ver/tocar
-- cada rol", pero no alcanza si el rol no tiene permiso a nivel de tabla.
-- Cuando una tabla se crea con el Table Editor de Supabase, el dashboard le
-- agrega automáticamente estos permisos a anon/authenticated; cuando se crea
-- por SQL Editor (como esta), hay que darlos a mano — si no, PostgREST
-- devuelve "permission denied for table db_audit_log" y la app muestra
-- "No se pudo cargar el historial" aunque la tabla y la política ya existan.
grant select, insert on db_audit_log to anon, authenticated;
grant usage, select on sequence db_audit_log_id_seq to anon, authenticated;

-- ============================================================
-- Historial de "Procesar día" — Catering Control
-- Ejecutar UNA sola vez por proyecto de Supabase
-- (Panel de Supabase → SQL Editor → New query → pegar → Run)
-- ============================================================

-- Una fila por fecha. "payload" es la foto completa de ese día,
-- ya resuelta (nombre, teléfono, dirección, ruta, driver, plan,
-- bolsas, dieta especial...) — no IDs, para que el historial no
-- cambie si después editás un cliente.
create table if not exists public.db_dispatch_snapshots (
  date       date primary key,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.db_dispatch_snapshots enable row level security;

-- Mismo esquema de acceso que el resto de tus tablas (db_clientes_rows,
-- db_notas_rows, etc.): el login es propio vía RPC, no Supabase Auth,
-- así que la clave publicable necesita poder leer y escribir directo.
-- Si tus otras tablas usan policies más restrictivas, replicá esa misma
-- acá en vez de este "using (true)".
drop policy if exists "dispatch_snapshots_all" on public.db_dispatch_snapshots;
create policy "dispatch_snapshots_all" on public.db_dispatch_snapshots
  for all using (true) with check (true);

-- ------------------------------------------------------------
-- Borrado automático de snapshots con más de 30 días de antigüedad.
-- Postgres no tiene TTL nativo, pero pg_cron corre esto solo, todos
-- los días, sin que nadie abra la app.
-- ------------------------------------------------------------

-- 1) Habilitar la extensión (una sola vez por proyecto). Si el CREATE
--    EXTENSION de abajo da error de permisos, hacelo desde:
--    Panel de Supabase → Database → Extensions → buscar "pg_cron" → Enable.
create extension if not exists pg_cron;

-- 2) Programar el job: corre todos los días a las 07:00 UTC
--    (≈ 03:00 hora de Bolivia) y borra lo que tenga más de 30 días.
select cron.schedule(
  'delete-old-dispatch-snapshots',
  '0 7 * * *',
  $$ delete from public.db_dispatch_snapshots where date < (current_date - interval '30 days'); $$
);

-- ------------------------------------------------------------
-- Comandos útiles para más adelante (no hace falta correrlos ahora):
--
--   select * from cron.job;                                   -- ver jobs programados
--   select * from cron.job_run_details order by start_time desc limit 20; -- ver si corrió bien
--   select cron.unschedule('delete-old-dispatch-snapshots');   -- desactivarlo
-- ------------------------------------------------------------

-- ==========================================================================
-- MIGRACIÓN: db_delivery_status (menú "Despacho")
-- ==========================================================================
-- Ejecutar en: Supabase → SQL Editor → New query → Run (una sola vez, por
-- cada proyecto/empresa que use Catering Control).
--
-- Qué es: una fila por (fecha, cliente) con el estado de entrega del día
-- (entregado / no entregado, observación y foto de respaldo en base64).
-- Se guarda aparte de db_dispatch_snapshots a propósito: los drivers marcan
-- entregas en paralelo durante el día, y con una fila por cliente cada
-- guardado solo toca su propia fila (nunca pisa lo que guardó otro driver).
--
-- Ajusta las políticas de RLS de abajo si tu proyecto ya tiene un esquema
-- de seguridad distinto al de las demás tablas (db_clientes_rows,
-- db_notas_rows, etc.) — están escritas para permitir lectura/escritura con
-- la misma llave pública (anon) que ya usa el resto de la app.
-- ==========================================================================

create table if not exists public.db_delivery_status (
  id          text primary key,          -- `${date}_${clientId}`
  date        date not null,
  client_id   text not null,
  payload     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create index if not exists db_delivery_status_date_idx on public.db_delivery_status (date);
create index if not exists db_delivery_status_client_idx on public.db_delivery_status (client_id);

alter table public.db_delivery_status enable row level security;

-- Mismo criterio de acceso que las demás tablas de la app (lectura y
-- escritura con la llave pública/anon del proyecto). Si tus otras tablas
-- usan políticas distintas (por ejemplo, autenticación real de usuarios),
-- reemplaza "anon" por el rol que corresponda.
drop policy if exists "delivery_status_select" on public.db_delivery_status;
create policy "delivery_status_select" on public.db_delivery_status
  for select to anon, authenticated using (true);

drop policy if exists "delivery_status_upsert" on public.db_delivery_status;
create policy "delivery_status_upsert" on public.db_delivery_status
  for insert to anon, authenticated with check (true);

drop policy if exists "delivery_status_update" on public.db_delivery_status;
create policy "delivery_status_update" on public.db_delivery_status
  for update to anon, authenticated using (true) with check (true);

-- ------------------------------------------------------------------------
-- Limpieza automática: igual que db_dispatch_snapshots, las fotos de
-- respaldo (base64 dentro de "payload") pueden pesar bastante si se
-- guardan indefinidamente. Este job borra filas de más de 30 días, todos
-- los días a la 1 AM. Requiere la extensión pg_cron (activarla en
-- Database → Extensions si aún no está activa).
-- ------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.schedule(
  'delivery-status-cleanup',
  '0 1 * * *',
  $$ delete from public.db_delivery_status where date < (now() - interval '30 days')::date; $$
);

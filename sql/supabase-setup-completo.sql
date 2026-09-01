-- =============================================================================
-- CATERING CONTROL · SETUP COMPLETO PARA UNA EMPRESA NUEVA (un solo archivo)
-- =============================================================================
-- Ejecuta este script UNA VEZ, completo, en el SQL Editor de un proyecto de
-- Supabase NUEVO (recién creado, vacío) cada vez que des de alta una empresa.
-- Es seguro volver a correrlo si algo falla a mitad de camino (todo usa
-- IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS).
--
-- Reemplaza, en un solo paso, a correr uno por uno:
--   supabase-setup-full.sql + supabase-clients-migration.sql +
--   supabase-audit-log-migration.sql + supabase-delivery-status-migration.sql +
--   supabase-dispatch-snapshots-migration.sql + supabase-notas-migration.sql +
--   supabase-premium-plan-migration.sql + supabase-public-branding-migration.sql +
--   supabase-address-override-migration.sql + migracion-retencion-auditoria.sql
--
-- Incluye:
--   · Tablas: db_clientes (legado), db_clientes_rows, db_personal,
--             db_inventario, db_audit_log, db_delivery_status,
--             db_dispatch_snapshots, db_notas_rows
--   · Funciones: login_cliente, login_staff, hash_password, get_branding,
--                get_plan_status, get_server_date, crear_nota_cliente,
--                set_client_address_override
--   · Políticas RLS de acceso público (anon/authenticated) + permisos de
--     secuencias
--   · Migración de clientes existentes (db_clientes → db_clientes_rows),
--     no rompe nada si el proyecto está vacío
--   · Limpieza automática con pg_cron: 30 días para delivery_status y
--     dispatch_snapshots, 15 días para audit_log
--
-- NO incluidos a propósito (llevan un dato tuyo, van aparte):
--   · reset-admin-password.sql   → fija la contraseña del admin inicial
--   · supabase-promote-superadmin.sql → vuelve Super Admin a un correo puntual
--
-- Después de correrlo, copia la URL y la "publishable key" del proyecto
-- (Project Settings → API) a config.js (supabaseUrl / supabaseKey).
-- =============================================================================

set search_path = public, extensions;

-- --------------------------------------------------------------------------
-- 1. Extensiones necesarias
-- --------------------------------------------------------------------------
create extension if not exists pgcrypto;
create extension if not exists pg_cron;  -- si da error de permisos, actívala
                                          -- desde Database → Extensions → pg_cron

-- --------------------------------------------------------------------------
-- 2. Tablas principales
-- --------------------------------------------------------------------------

-- Legado/respaldo: ya no se usa para la lista de clientes (ver
-- db_clientes_rows), se deja creada por compatibilidad.
create table if not exists db_clientes (
  id text primary key default 'main',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Clientes: UNA FILA POR CLIENTE.
create table if not exists db_clientes_rows (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Personal: staffUsers, drivers, rutas y Configuración (settings).
create table if not exists db_personal (
  id text primary key default 'main',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists db_inventario (
  id text primary key default 'main',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Historial de auditoría: solo se agregan filas, nunca se pisan.
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

-- Estado de entrega por (fecha, cliente) — menú "Despacho".
create table if not exists public.db_delivery_status (
  id          text primary key,          -- `${date}_${clientId}`
  date        date not null,
  client_id   text not null,
  payload     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Snapshots (foto congelada) de cada "Procesar día".
create table if not exists public.db_dispatch_snapshots (
  date       date primary key,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);

-- Notas (recordatorios del staff + mensajes de clientes) — una fila por nota.
create table if not exists db_notas_rows (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

-- Bloqueo por fuerza bruta del login de staff (ver login_staff más abajo).
create table if not exists public.db_login_attempts (
  email text primary key,
  fail_count int not null default 0,
  locked_until timestamptz,
  last_attempt timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- 3. Índices para rendimiento
-- --------------------------------------------------------------------------
create index if not exists db_audit_log_at_idx on db_audit_log (at desc);
create index if not exists db_delivery_status_date_idx on public.db_delivery_status (date);
create index if not exists db_delivery_status_client_idx on public.db_delivery_status (client_id);

-- --------------------------------------------------------------------------
-- 4. RLS y políticas de acceso público (con la clave "publishable"/anon,
--    tal como está armada la app hoy: login propio vía RPC, no Supabase Auth)
-- --------------------------------------------------------------------------
alter table db_clientes                  enable row level security;
alter table db_clientes_rows             enable row level security;
alter table db_personal                  enable row level security;
alter table db_inventario                enable row level security;
alter table db_audit_log                 enable row level security;
alter table public.db_delivery_status    enable row level security;
alter table public.db_dispatch_snapshots enable row level security;
alter table db_notas_rows                enable row level security;
alter table public.db_login_attempts     enable row level security;

drop policy if exists "public access clientes" on db_clientes;
create policy "public access clientes" on db_clientes for all using (true) with check (true);

drop policy if exists "public access clientes filas" on db_clientes_rows;
create policy "public access clientes filas" on db_clientes_rows for all using (true) with check (true);

drop policy if exists "public access personal" on db_personal;
create policy "public access personal" on db_personal for all using (true) with check (true);

drop policy if exists "public access inventario" on db_inventario;
create policy "public access inventario" on db_inventario for all using (true) with check (true);

drop policy if exists "public access audit log" on db_audit_log;
create policy "public access audit log" on db_audit_log for all using (true) with check (true);

drop policy if exists "delivery_status_select" on public.db_delivery_status;
create policy "delivery_status_select" on public.db_delivery_status for select to anon, authenticated using (true);
drop policy if exists "delivery_status_upsert" on public.db_delivery_status;
create policy "delivery_status_upsert" on public.db_delivery_status for insert to anon, authenticated with check (true);
drop policy if exists "delivery_status_update" on public.db_delivery_status;
create policy "delivery_status_update" on public.db_delivery_status for update to anon, authenticated using (true) with check (true);

drop policy if exists "dispatch_snapshots_all" on public.db_dispatch_snapshots;
create policy "dispatch_snapshots_all" on public.db_dispatch_snapshots for all using (true) with check (true);

drop policy if exists "notas_select" on db_notas_rows;
create policy "notas_select" on db_notas_rows for select using (true);
drop policy if exists "notas_insert" on db_notas_rows;
create policy "notas_insert" on db_notas_rows for insert with check (true);
drop policy if exists "notas_update" on db_notas_rows;
create policy "notas_update" on db_notas_rows for update using (true) with check (true);
drop policy if exists "notas_delete" on db_notas_rows;
create policy "notas_delete" on db_notas_rows for delete using (true);

-- db_login_attempts: SIN acceso público — solo la toca login_staff() del
-- lado del servidor (SECURITY DEFINER). A diferencia de las demás tablas,
-- acá no se le da nada a anon/authenticated a propósito.
drop policy if exists "no public access login attempts" on public.db_login_attempts;
create policy "no public access login attempts" on public.db_login_attempts for all using (false) with check (false);

-- RLS no alcanza si el rol no tiene permiso a nivel de tabla/secuencia:
grant select, insert on db_audit_log to anon, authenticated;
grant usage, select on sequence db_audit_log_id_seq to anon, authenticated;

-- --------------------------------------------------------------------------
-- 5. Funciones de login, hash, branding, plan y fecha de servidor
-- --------------------------------------------------------------------------

create or replace function login_cliente(p_carnet text, p_phone text)
returns table(id text, name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  return query
  select db_clientes_rows.id, payload ->> 'name'
  from db_clientes_rows
  where lower(trim(coalesce(payload ->> 'carnet', ''))) = lower(trim(coalesce(p_carnet, '')))
    and (
      regexp_replace(coalesce(payload ->> 'phone1', ''), '\D', '', 'g') = v_phone
      or regexp_replace(coalesce(payload ->> 'phone2', ''), '\D', '', 'g') = v_phone
    )
  limit 1;
end;
$$;
revoke all on function login_cliente(text, text) from public;
grant execute on function login_cliente(text, text) to anon, authenticated;

drop function if exists login_staff(text, text);
create or replace function login_staff(p_email text, p_password text)
returns table(id text, name text, role text, "routeId" text, "driverId" text, locked_seconds int)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_users jsonb;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_attempt db_login_attempts%rowtype;
  v_matched boolean := false;
  v_new_fail_count int;
  v_remaining int;
begin
  -- Bloqueo por fuerza bruta: 3 intentos fallidos seguidos con el mismo
  -- correo lo bloquean 1 minuto (ver punto 5 del pedido original). El
  -- conteo vive en la base de datos (db_login_attempts), no en el
  -- navegador, porque cualquiera que llame a esta función directo se
  -- saltaría un contador hecho solo en JavaScript.
  select * into v_attempt from db_login_attempts where email = v_email;
  if found and v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    v_remaining := ceil(extract(epoch from (v_attempt.locked_until - now())));
    return query select null::text, null::text, null::text, null::text, null::text, greatest(v_remaining, 1);
    return;
  end if;

  select coalesce(payload -> 'staffUsers', '[]'::jsonb) into v_users from db_personal where db_personal.id = 'main';

  if v_users is null or jsonb_array_length(v_users) = 0 then
    if v_email = 'admin@catering.local' and p_password = 'admin123' then
      v_matched := true;
    end if;
  else
    v_matched := exists(
      select 1 from jsonb_array_elements(v_users) as u
      where lower(u ->> 'email') = v_email
        and u ->> 'passwordHash' is not null
        and crypt(p_password, u ->> 'passwordHash') = (u ->> 'passwordHash')
    );
  end if;

  if v_matched then
    delete from db_login_attempts where email = v_email;
    if v_users is null or jsonb_array_length(v_users) = 0 then
      return query select 'staff_admin'::text, 'Administrador'::text, 'admin'::text, ''::text, ''::text, 0;
    else
      return query
      select u ->> 'id', u ->> 'name', u ->> 'role', u ->> 'routeId', u ->> 'driverId', 0
      from jsonb_array_elements(v_users) as u
      where lower(u ->> 'email') = v_email
        and u ->> 'passwordHash' is not null
        and crypt(p_password, u ->> 'passwordHash') = (u ->> 'passwordHash')
      limit 1;
    end if;
    return;
  end if;

  v_new_fail_count := coalesce(v_attempt.fail_count, 0) + 1;
  if v_new_fail_count >= 3 then
    insert into db_login_attempts (email, fail_count, locked_until, last_attempt)
      values (v_email, 0, now() + interval '1 minute', now())
    on conflict (email) do update
      set fail_count = 0, locked_until = now() + interval '1 minute', last_attempt = now();
  else
    insert into db_login_attempts (email, fail_count, locked_until, last_attempt)
      values (v_email, v_new_fail_count, null, now())
    on conflict (email) do update
      set fail_count = v_new_fail_count, locked_until = null, last_attempt = now();
  end if;

  return;
end;
$$;
revoke all on function login_staff(text, text) from public;
grant execute on function login_staff(text, text) to anon, authenticated;

create or replace function hash_password(p_password text)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select crypt(p_password, gen_salt('bf', 10));
$$;
revoke all on function hash_password(text) from public;
grant execute on function hash_password(text) to anon, authenticated;

create or replace function get_branding()
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select coalesce(payload -> 'settings', '{}'::jsonb)
  from db_personal
  where id = 'main';
$$;
revoke all on function get_branding() from public;
grant execute on function get_branding() to anon, authenticated;

create or replace function public.get_plan_status()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'plan', coalesce(payload->'settings'->>'plan', 'basico')
  )
  from db_personal
  where id = 'main';
$$;
grant execute on function public.get_plan_status() to anon, authenticated;

create or replace function get_server_date()
returns text
language sql
security definer
stable
as $$
  select to_char(now() at time zone 'utc', 'YYYY-MM-DD');
$$;
grant execute on function get_server_date() to anon, authenticated;

-- --------------------------------------------------------------------------
-- 6. Notas creadas por el cliente desde su portal (sin darle acceso directo
--    a la tabla db_notas_rows)
-- --------------------------------------------------------------------------
create or replace function crear_nota_cliente(p_client_id text, p_texto text)
returns text
language plpgsql
security definer
as $$
declare
  v_id text := 'n_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  v_client_name text;
begin
  if p_texto is null or length(trim(p_texto)) = 0 then
    raise exception 'El mensaje no puede estar vacío';
  end if;

  select payload->>'name' into v_client_name
  from db_clientes_rows where id = p_client_id;

  insert into db_notas_rows (id, payload, updated_at)
  values (
    v_id,
    jsonb_build_object(
      'text', trim(p_texto),
      'dueDate', to_char(current_date, 'YYYY-MM-DD'),
      'status', 'pendiente',
      'source', 'cliente',
      'clientId', p_client_id,
      'clientName', coalesce(v_client_name, ''),
      'createdAt', now(),
      'read', false
    ),
    now()
  );

  return v_id;
end;
$$;
grant execute on function crear_nota_cliente(text, text) to anon;

-- --------------------------------------------------------------------------
-- 7. Cambio de dirección de mañana desde el portal de cliente (direcciones
--    múltiples). Toda la validación ocurre en el servidor: no confía en el
--    reloj del navegador del cliente.
-- --------------------------------------------------------------------------
create or replace function public.set_client_address_override(
  p_client_id text,
  p_address_id text,
  p_date text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row db_clientes_rows%rowtype;
  v_now_bo timestamptz := now() at time zone 'America/La_Paz';
  v_addr_exists boolean;
  v_overrides jsonb;
begin
  if extract(hour from v_now_bo) >= 22 then
    raise exception 'Ya pasó el horario para cambiar la dirección (22:00 hora Bolivia).';
  end if;

  select * into v_row from db_clientes_rows where id = p_client_id;
  if not found then
    raise exception 'Cliente no encontrado.';
  end if;

  select exists(
    select 1 from jsonb_array_elements(coalesce(v_row.payload->'addresses', '[]'::jsonb)) a
    where a->>'id' = p_address_id
  ) into v_addr_exists;
  if not v_addr_exists then
    raise exception 'Esa dirección no pertenece a este cliente.';
  end if;

  select coalesce(
    (select jsonb_agg(o) from jsonb_array_elements(coalesce(v_row.payload->'addressOverrides', '[]'::jsonb)) o
     where o->>'date' <> p_date),
    '[]'::jsonb
  ) into v_overrides;
  v_overrides := v_overrides || jsonb_build_array(jsonb_build_object('date', p_date, 'addressId', p_address_id));

  update db_clientes_rows
    set payload = jsonb_set(payload, '{addressOverrides}', v_overrides, true),
        updated_at = now()
    where id = p_client_id;

  return v_overrides;
end;
$$;
revoke all on function public.set_client_address_override(text, text, text) from public;
grant execute on function public.set_client_address_override(text, text, text) to anon, authenticated;

-- --------------------------------------------------------------------------
-- 8. Datos iniciales (filas "main" — la app las crea sola igual si faltan)
-- --------------------------------------------------------------------------
insert into db_clientes (id, payload) values ('main', '{}'::jsonb) on conflict (id) do nothing;
insert into db_personal (id, payload) values ('main', '{}'::jsonb) on conflict (id) do nothing;
insert into db_inventario (id, payload) values ('main', '{}'::jsonb) on conflict (id) do nothing;

-- --------------------------------------------------------------------------
-- 9. Migración de clientes existentes (si el proyecto ya tenía datos en
--    db_clientes; en un proyecto nuevo/vacío esto simplemente no copia nada)
-- --------------------------------------------------------------------------
insert into db_clientes_rows (id, payload)
select
  coalesce(c ->> 'id', gen_random_uuid()::text) as id,
  c as payload
from db_clientes, jsonb_array_elements(coalesce(payload -> 'clients', '[]'::jsonb)) as c
where db_clientes.id = 'main'
on conflict (id) do update set payload = excluded.payload, updated_at = now();

-- --------------------------------------------------------------------------
-- 10. Limpieza automática con pg_cron
-- --------------------------------------------------------------------------

-- delivery_status y dispatch_snapshots: 30 días, todos los días a la 1 AM UTC.
do $do$
begin
  perform cron.schedule(
    'delivery-status-cleanup',
    '0 1 * * *',
    $cron$ delete from public.db_delivery_status where date < (now() - interval '30 days')::date; $cron$
  );
exception when others then
  raise notice 'No se pudo programar el cron de delivery_status (revisa permisos/pg_cron).';
end $do$;

do $do$
begin
  perform cron.schedule(
    'delete-old-dispatch-snapshots',
    '0 1 * * *',
    $cron$ delete from public.db_dispatch_snapshots where date < (current_date - interval '30 days'); $cron$
  );
exception when others then
  raise notice 'No se pudo programar el cron de dispatch_snapshots (revisa permisos/pg_cron).';
end $do$;

-- audit_log: 15 días, todos los días a las 04:00 UTC (00:00 hora Bolivia).
do $do$
begin
  perform cron.unschedule('borrar-auditoria-vieja')
  where exists (select 1 from cron.job where jobname = 'borrar-auditoria-vieja');

  perform cron.schedule(
    'borrar-auditoria-vieja',
    '0 4 * * *',
    $cron$ delete from db_audit_log where at < now() - interval '15 days'; $cron$
  );
exception when others then
  raise notice 'No se pudo programar el cron de audit_log (revisa permisos/pg_cron).';
end $do$;

-- db_login_attempts: borra correos que ya no insisten (probados por bots),
-- todos los días a las 04:30 UTC.
do $do$
begin
  perform cron.schedule(
    'limpiar-intentos-login-viejos',
    '30 4 * * *',
    $cron$ delete from public.db_login_attempts where last_attempt < now() - interval '1 day'; $cron$
  );
exception when others then
  raise notice 'No se pudo programar el cron de limpieza de intentos de login (revisa permisos/pg_cron).';
end $do$;

-- =============================================================================
-- FIN DEL SCRIPT. Verificaciones útiles después de correrlo:
--   select * from db_personal;                 -- debe existir la fila 'main'
--   select * from db_clientes_rows limit 5;
--   select get_branding();
--   select get_plan_status();
--   select * from cron.job;                    -- los 3 jobs de limpieza programados
--
-- Después de esto, corre por separado (llevan un dato tuyo):
--   reset-admin-password.sql       → contraseña del admin inicial
--   supabase-promote-superadmin.sql → vuelve Super Admin a un correo puntual
-- =============================================================================

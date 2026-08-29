-- ==========================================================================
-- Catering Control · Setup COMPLETO para un proyecto de Supabase NUEVO
-- ==========================================================================
-- Usa este script cuando des de alta una empresa nueva con un proyecto de
-- Supabase recién creado (vacío). Reemplaza a correr uno por uno:
--   supabase-setup.sql + supabase-clients-migration.sql +
--   supabase-audit-log-migration.sql + supabase-premium-plan-migration.sql +
--   supabase-public-branding-migration.sql + supabase-security-update.sql
-- porque junta la versión FINAL de cada tabla/función en un solo script,
-- sin los pasos intermedios que solo hacían falta para migrar datos ya
-- existentes en un proyecto viejo (acá no hay nada que migrar: el proyecto
-- está vacío).
--
-- Qué hacer:
--   1) Crea el proyecto nuevo en Supabase.
--   2) Supabase → tu proyecto → SQL Editor → New query → pega TODO este
--      archivo → Run.
--   3) Copia la URL y la "publishable key" de ese proyecto (Project
--      Settings → API) a config.js (supabaseUrl / supabaseKey) de la
--      empresa nueva.
--   4) Corre reset-admin-password.sql aparte para elegir la contraseña del
--      admin inicial (o entra directo con admin@catering.local / admin123,
--      el atajo de primer arranque, y cámbiala apenas entres).
-- Es seguro volver a correr este script si algo falla a mitad de camino.
-- ==========================================================================

set search_path = public, extensions;
create extension if not exists pgcrypto;

-- --------------------------------------------------------------------------
-- 1) Tablas base
-- --------------------------------------------------------------------------

-- Legado/respaldo: ya no se usa para guardar la lista de clientes (ver
-- db_clientes_rows más abajo), pero index.js todavía puede leer/escribir acá
-- para otras cosas del bloque "clientes" si las hubiera; se deja creada por
-- compatibilidad con el resto del código.
create table if not exists db_clientes (
  id text primary key default 'main',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Clientes: UNA FILA POR CLIENTE. Guardar un cambio en un cliente solo
-- sube/baja esa fila, no la lista completa.
create table if not exists db_clientes_rows (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Personal: usuarios del equipo (staffUsers), drivers, rutas y Configuración
-- (settings) — todo junto en un solo bloque JSON.
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

-- Historial de auditoría: una fila NUEVA por cada evento (nunca se
-- sobrescribe una fila con otra).
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
create index if not exists db_audit_log_at_idx on db_audit_log (at desc);

-- --------------------------------------------------------------------------
-- 2) RLS: acceso público con la clave "publishable" (anon), sin cifrado
-- adicional — tal como está armada la app hoy.
-- --------------------------------------------------------------------------

alter table db_clientes enable row level security;
alter table db_clientes_rows enable row level security;
alter table db_personal enable row level security;
alter table db_inventario enable row level security;
alter table db_audit_log enable row level security;

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

-- Permisos a nivel de tabla (RLS no alcanza si el rol no tiene esto):
grant select, insert on db_audit_log to anon, authenticated;
grant usage, select on sequence db_audit_log_id_seq to anon, authenticated;

-- Filas iniciales vacías (opcional, la app las crea sola al guardar).
insert into db_clientes (id, payload) values ('main', '{}'::jsonb) on conflict (id) do nothing;
insert into db_personal (id, payload) values ('main', '{}'::jsonb) on conflict (id) do nothing;
insert into db_inventario (id, payload) values ('main', '{}'::jsonb) on conflict (id) do nothing;

-- --------------------------------------------------------------------------
-- 3) Login y contraseñas: la verificación ocurre en el servidor, nunca se
-- descarga la tabla completa al navegador; contraseñas guardadas con hash
-- bcrypt (nunca en texto plano).
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

create or replace function login_staff(p_email text, p_password text)
returns table(id text, name text, role text, "routeId" text, "driverId" text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_users jsonb;
begin
  select coalesce(payload -> 'staffUsers', '[]'::jsonb) into v_users from db_personal where db_personal.id = 'main';

  if v_users is null or jsonb_array_length(v_users) = 0 then
    if lower(p_email) = 'admin@catering.local' and p_password = 'admin123' then
      return query select 'staff_admin'::text, 'Administrador'::text, 'admin'::text, ''::text, ''::text;
    end if;
    return;
  end if;

  return query
  select u ->> 'id', u ->> 'name', u ->> 'role', u ->> 'routeId', u ->> 'driverId'
  from jsonb_array_elements(v_users) as u
  where lower(u ->> 'email') = lower(p_email)
    and u ->> 'passwordHash' is not null
    and crypt(p_password, u ->> 'passwordHash') = (u ->> 'passwordHash')
  limit 1;
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

-- --------------------------------------------------------------------------
-- 4) Branding público (login.html y cliente.html, antes de iniciar sesión):
-- solo el bloque "settings" (nombre, logo, whatsapp, instagram...), nunca
-- staffUsers/drivers/routes.
-- --------------------------------------------------------------------------

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

-- --------------------------------------------------------------------------
-- 5) Estado del plan (Premium/Básico) para el portal de cliente, sin
-- exponer el resto de db_personal.
-- --------------------------------------------------------------------------

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

-- --------------------------------------------------------------------------
-- 6) Fecha del servidor: para que el vencimiento del Premium por días se
-- calcule contra la hora real de Supabase y no contra el reloj del
-- dispositivo (evita que cambiar la fecha de la PC/celular altere el
-- vencimiento).
-- --------------------------------------------------------------------------

create or replace function get_server_date()
returns text
language sql
security definer
stable
as $$
  select to_char(now() at time zone 'utc', 'YYYY-MM-DD');
$$;
grant execute on function get_server_date() to anon, authenticated;

-- ==========================================================================
-- Con esto el proyecto nuevo queda igual de al día que el viejo. Aparte,
-- según lo que necesites:
--   · reset-admin-password.sql   → para fijar la contraseña del admin
--     inicial en vez de usar el atajo admin@catering.local / admin123.
--   · supabase-promote-superadmin.sql → para volver Super Admin a un
--     usuario puntual (edita el correo dentro de ese script primero).
-- Esos dos siguen siendo scripts aparte porque llevan un dato tuyo
-- (contraseña / correo) que no tiene sentido dejar fijo acá.
-- ==========================================================================

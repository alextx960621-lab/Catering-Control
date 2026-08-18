-- ==========================================================================
-- Catering Control · Configuración de Supabase
-- Ejecuta TODO este script una sola vez en:
-- Supabase → tu proyecto → SQL Editor → New query → pega esto → Run
-- Crea 3 bases de datos (tablas) separadas: clientes, personal e inventario.
-- ==========================================================================

create table if not exists db_clientes (
  id text primary key default 'main',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

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

-- Habilitamos RLS y permitimos lectura/escritura pública con la clave
-- "publishable" (anon). Como se pidió, no hay cifrado ni autenticación
-- adicional: cualquiera con la clave publishable puede leer y escribir.
alter table db_clientes enable row level security;
alter table db_personal enable row level security;
alter table db_inventario enable row level security;

drop policy if exists "public access clientes" on db_clientes;
create policy "public access clientes" on db_clientes for all using (true) with check (true);

drop policy if exists "public access personal" on db_personal;
create policy "public access personal" on db_personal for all using (true) with check (true);

drop policy if exists "public access inventario" on db_inventario;
create policy "public access inventario" on db_inventario for all using (true) with check (true);

-- Fila inicial vacía en cada tabla (opcional, la app la crea sola al guardar
-- por primera vez, pero no está de más dejarla lista).
insert into db_clientes (id, payload) values ('main', '{}'::jsonb) on conflict (id) do nothing;
insert into db_personal (id, payload) values ('main', '{}'::jsonb) on conflict (id) do nothing;
insert into db_inventario (id, payload) values ('main', '{}'::jsonb) on conflict (id) do nothing;

-- ==========================================================================
-- Login seguro y hash de contraseñas (ver supabase-security-update.sql para
-- la explicación completa). Se incluye aquí también para que un proyecto
-- nuevo arranque ya con esto desde el primer día.
-- ==========================================================================
create extension if not exists pgcrypto;

create or replace function login_cliente(p_carnet text, p_phone text)
returns table(id text, name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  return query
  select c ->> 'id', c ->> 'name'
  from db_clientes, jsonb_array_elements(coalesce(payload -> 'clients', '[]'::jsonb)) as c
  where db_clientes.id = 'main'
    and lower(trim(coalesce(c ->> 'carnet', ''))) = lower(trim(coalesce(p_carnet, '')))
    and (
      regexp_replace(coalesce(c ->> 'phone1', ''), '\D', '', 'g') = v_phone
      or regexp_replace(coalesce(c ->> 'phone2', ''), '\D', '', 'g') = v_phone
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

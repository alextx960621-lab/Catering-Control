-- ==========================================================================
-- Catering Control · Actualización de seguridad (login sin exponer datos)
-- Ejecuta TODO este script una sola vez en cada proyecto de Supabase que
-- YA tengas funcionando (Supabase → tu proyecto → SQL Editor → New query →
-- pega esto → Run). No borra datos existentes.
--
-- Qué soluciona:
-- 1) Antes, login.html descargaba TODA la tabla de clientes (nombres,
--    carnets, teléfonos, direcciones...) y TODA la de personal (incluida la
--    contraseña de cada usuario, en texto plano) al navegador de cualquier
--    persona que abriera la página de login, incluso antes de escribir nada.
--    Ahora la verificación de carnet/teléfono y de correo/contraseña ocurre
--    dentro de la base de datos (funciones más abajo) y el navegador solo
--    recibe el id/nombre de quien coincidió.
-- 2) Las contraseñas del equipo (Administrador, Editor, Cocina, Driver) se
--    guardan como hash (bcrypt), no en texto plano.
-- ==========================================================================

-- Habilita el módulo de criptografía de Postgres (para el hash bcrypt).
create extension if not exists pgcrypto;

-- --------------------------------------------------------------------------
-- login_cliente: verifica carnet + teléfono dentro de la base de datos y
-- devuelve SOLO el id y el nombre del cliente que coincide (nunca la lista
-- completa de clientes).
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
  select c ->> 'id', c ->> 'name'
  from db_clientes, jsonb_array_elements(coalesce(payload -> 'clients', '[]'::jsonb)) as c
  where id = 'main'
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

-- --------------------------------------------------------------------------
-- login_staff: verifica correo + contraseña contra el hash bcrypt guardado
-- en "passwordHash". Si todavía no se guardó ningún usuario en la base de
-- datos (primer arranque de la app), permite entrar una sola vez con
-- admin@catering.local / admin123 para poder crear el resto de usuarios;
-- en cuanto se crea el primer usuario real, este atajo deja de aplicarse.
-- --------------------------------------------------------------------------
create or replace function login_staff(p_email text, p_password text)
returns table(id text, name text, role text, "routeId" text, "driverId" text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_users jsonb;
begin
  select coalesce(payload -> 'staffUsers', '[]'::jsonb) into v_users from db_personal where id = 'main';

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

-- --------------------------------------------------------------------------
-- hash_password: genera un hash bcrypt en el servidor. El panel (index.html,
-- pantalla Usuarios) llama a esto al crear/editar un usuario, para que la
-- contraseña en texto plano nunca se guarde, solo su hash.
-- --------------------------------------------------------------------------
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

-- ==========================================================================
-- IMPORTANTE — límite real de esta arquitectura:
-- Estas funciones evitan que el LOGIN exponga toda la base de datos, y
-- evitan guardar contraseñas en texto plano. Pero las tablas db_clientes y
-- db_personal siguen con RLS "using (true)": una vez que alguien ya entró al
-- panel (index.html) o al portal de cliente (cliente.html), la app sigue
-- leyendo/escribiendo esas tablas directamente con la misma clave pública
-- (anon) que usa cualquier visitante, porque la app no usa un sistema de
-- sesiones real de Supabase (Supabase Auth). Es decir: cualquiera que
-- consiga o adivine esa clave publishable (que es pública en el código
-- fuente, así se llama) puede leer o escribir todas las tablas igual,
-- sin pasar por el login.
-- La forma correcta de cerrar esto del todo es migrar a Supabase Auth
-- (cuentas reales por usuario/cliente) y cambiar las políticas de "using
-- (true)" a políticas que exijan auth.uid(). Es un cambio más grande al
-- login y al guardado de datos — avísame si quieres que lo implemente.
-- ==========================================================================

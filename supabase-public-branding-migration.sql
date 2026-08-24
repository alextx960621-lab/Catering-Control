-- ==========================================================================
-- Catering Control · Migración: Branding público (sin exponer personal)
-- ==========================================================================
-- Por qué: login.html (antes de iniciar sesión) y cliente.html (portal de
-- autoservicio) necesitan mostrar el nombre de la empresa y el logo
-- configurados en Configuración → eso vive en db_personal.payload->'settings'.
-- Pero hasta ahora ambas páginas pedían dbGet('personal') COMPLETO, que
-- además de "settings" trae staffUsers (con el hash de la contraseña de
-- cada usuario del equipo), drivers y routes. Con la política RLS abierta
-- (using(true)) que usa el proyecto, cualquiera que abriera esas dos páginas
-- descargaba todo eso sin loguearse.
--
-- Qué hace este script: crea una función get_branding() que devuelve SOLO
-- el bloque "settings" (nombre, logo, whatsapp, instagram, imagen de
-- publicidad, íconos de menú, etc.) — nunca staffUsers/drivers/routes.
-- login.js y cliente.js ya fueron actualizados para usar esta función en
-- vez de dbGet('personal').
--
-- Corre este script UNA VEZ en el SQL Editor de tu proyecto de Supabase.
-- Es seguro volver a correrlo.
-- ==========================================================================

set search_path = public, extensions;

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

-- ==========================================================================
-- IMPORTANTE: esto no reemplaza el uso normal de dbGet('personal') dentro
-- del panel de operaciones (index.html), donde SÍ hace falta staffUsers,
-- drivers y routes para que el equipo administre todo eso — ahí sigue igual.
-- Este cambio es específicamente para las dos páginas públicas (login y
-- portal de cliente) que antes pedían la tabla completa solo para leer el
-- nombre/logo de la empresa.
-- ==========================================================================

-- ============================================================================
-- PLAN PREMIUM / BÁSICO — migración
-- ============================================================================
-- No hace falta ninguna columna ni tabla nueva: el plan ("basico" | "premium")
-- ya vive dentro de db_personal.payload -> settings -> plan (es JSON, y el
-- código de index.js ya lo agrega solo la primera vez que guarda Configuración).
--
-- Lo único que falta es una función pública para que cliente.html (el portal
-- del cliente, que NO tiene sesión de staff) pueda saber si el plan es
-- Premium sin descargar el resto de db_personal — que además de "settings"
-- trae staffUsers con el hash de la contraseña de cada usuario del equipo.
--
-- Ejecuta esto una vez en Supabase → SQL Editor → New query → Run.
-- ============================================================================

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

-- Permite llamarla desde el navegador con la clave pública (misma política
-- que ya usas para get_branding/login_cliente/login_staff).
grant execute on function public.get_plan_status() to anon, authenticated;

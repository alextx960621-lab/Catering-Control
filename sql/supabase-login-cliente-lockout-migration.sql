-- ============================================================================
-- Catering Control · Candado de fuerza bruta para login_cliente (carnet +
-- teléfono), igual mecanismo que ya tiene login_staff: 3 intentos fallidos
-- seguidos con el mismo carnet bloquean 1 minuto. El conteo vive en la base
-- (no en el navegador), porque cualquiera que llame a la función directo se
-- saltaría un contador hecho solo en JavaScript.
--
-- Cómo correr esto: Supabase Dashboard → SQL Editor → pegar y ejecutar
-- completo, una sola vez. Es seguro volver a correrlo (usa IF NOT EXISTS /
-- OR REPLACE / DROP POLICY IF EXISTS).
-- ============================================================================

set search_path = public, extensions;

-- --------------------------------------------------------------------------
-- 1. Tabla de intentos, misma forma que db_login_attempts pero por carnet.
-- --------------------------------------------------------------------------
create table if not exists public.db_client_login_attempts (
  carnet       text primary key,
  fail_count   int not null default 0,
  locked_until timestamptz,
  last_attempt timestamptz not null default now()
);

alter table public.db_client_login_attempts enable row level security;

-- Sin acceso público — solo la toca login_cliente() del lado del servidor
-- (SECURITY DEFINER), igual criterio que db_login_attempts.
drop policy if exists "no public access client login attempts" on public.db_client_login_attempts;
create policy "no public access client login attempts"
  on public.db_client_login_attempts for all using (false) with check (false);

-- --------------------------------------------------------------------------
-- 2. login_cliente con el candado. Cambia el tipo de retorno (agrega
--    locked_seconds) — el frontend de login.html ya se actualiza para leerlo,
--    igual que StaffForm ya lee locked_seconds de login_staff.
-- --------------------------------------------------------------------------
drop function if exists login_cliente(text, text);
create or replace function login_cliente(p_carnet text, p_phone text)
returns table(id text, name text, locked_seconds int)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_carnet text := lower(trim(coalesce(p_carnet, '')));
  v_phone  text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_attempt public.db_client_login_attempts%rowtype;
  v_matched_id text;
  v_matched_name text;
  v_new_fail_count int;
  v_remaining int;
begin
  select * into v_attempt from public.db_client_login_attempts where carnet = v_carnet;
  if found and v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    v_remaining := ceil(extract(epoch from (v_attempt.locked_until - now())));
    return query select null::text, null::text, greatest(v_remaining, 1);
    return;
  end if;

  select db_clientes_rows.id, payload ->> 'name'
    into v_matched_id, v_matched_name
  from db_clientes_rows
  where lower(trim(coalesce(payload ->> 'carnet', ''))) = v_carnet
    and (
      regexp_replace(coalesce(payload ->> 'phone1', ''), '\D', '', 'g') = v_phone
      or regexp_replace(coalesce(payload ->> 'phone2', ''), '\D', '', 'g') = v_phone
    )
  limit 1;

  if v_matched_id is not null then
    delete from public.db_client_login_attempts where carnet = v_carnet;
    return query select v_matched_id, v_matched_name, 0;
    return;
  end if;

  v_new_fail_count := coalesce(v_attempt.fail_count, 0) + 1;
  if v_new_fail_count >= 3 then
    insert into public.db_client_login_attempts (carnet, fail_count, locked_until, last_attempt)
      values (v_carnet, 0, now() + interval '1 minute', now())
    on conflict (carnet) do update
      set fail_count = 0, locked_until = now() + interval '1 minute', last_attempt = now();
  else
    insert into public.db_client_login_attempts (carnet, fail_count, locked_until, last_attempt)
      values (v_carnet, v_new_fail_count, null, now())
    on conflict (carnet) do update
      set fail_count = v_new_fail_count, locked_until = null, last_attempt = now();
  end if;

  return;
end;
$$;
revoke all on function login_cliente(text, text) from public;
grant execute on function login_cliente(text, text) to anon, authenticated;

-- --------------------------------------------------------------------------
-- 3. Limpieza automática de intentos viejos (igual que ya existe para
--    db_login_attempts de staff), todos los días a las 04:30 UTC.
-- --------------------------------------------------------------------------
do $do$
begin
  perform cron.unschedule('limpiar-intentos-login-cliente-viejos')
  where exists (select 1 from cron.job where jobname = 'limpiar-intentos-login-cliente-viejos');

  perform cron.schedule(
    'limpiar-intentos-login-cliente-viejos',
    '30 4 * * *',
    $cron$ delete from public.db_client_login_attempts where last_attempt < now() - interval '1 day'; $cron$
  );
exception when others then
  raise notice 'No se pudo programar el cron de limpieza de intentos de login de cliente (revisa permisos/pg_cron).';
end $do$;

-- ============================================================================
-- FIN. Verificación después de correrlo:
--   select login_cliente('carnet_de_prueba', '00000000');  -- 3 veces seguidas
--   -- la 3ra debe devolver locked_seconds > 0 y las próximas también hasta
--   -- que pase 1 minuto.
-- ============================================================================

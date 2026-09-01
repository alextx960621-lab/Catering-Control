-- ==========================================================================
-- Catering Control · Bloqueo por fuerza bruta en el login de staff
-- ==========================================================================
-- Por qué en el SERVIDOR y no en el navegador: cualquiera que sepa llamar a
-- la función RPC directamente (sin abrir login.html) se saltaría un
-- contador hecho solo en JavaScript. El conteo tiene que vivir en la base
-- de datos, donde no se puede evitar.
--
-- Qué hace: agrega una tabla db_login_attempts (una fila por correo
-- intentado) y modifica login_staff() para que, después de 3 intentos
-- fallidos SEGUIDOS con el mismo correo, bloquee ese correo por 1 minuto
-- antes de dejarlo intentar de nuevo — incluso si en el 4to intento pone
-- la contraseña correcta. Un login exitoso resetea el contador a 0.
--
-- Corre esto UNA vez en el SQL Editor de tu proyecto de Supabase (encima
-- de lo que ya tienes corrido). Es seguro volver a correrlo.
-- ==========================================================================

set search_path = public, extensions;

create table if not exists public.db_login_attempts (
  email text primary key,
  fail_count int not null default 0,
  locked_until timestamptz,
  last_attempt timestamptz not null default now()
);

alter table public.db_login_attempts enable row level security;

-- Nadie necesita leer/escribir esta tabla directo desde el navegador — solo
-- la toca login_staff() del lado del servidor (SECURITY DEFINER). Por eso
-- NO se le da acceso a anon/authenticated (a diferencia de las demás tablas
-- de este proyecto, que sí son de acceso público).
drop policy if exists "no public access login attempts" on public.db_login_attempts;
create policy "no public access login attempts" on public.db_login_attempts for all using (false) with check (false);

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
  -- 1) ¿Este correo está bloqueado ahora mismo?
  select * into v_attempt from db_login_attempts where email = v_email;
  if found and v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    v_remaining := ceil(extract(epoch from (v_attempt.locked_until - now())));
    return query select null::text, null::text, null::text, null::text, null::text, greatest(v_remaining, 1);
    return;
  end if;

  -- 2) Verificación normal de credenciales (igual que antes).
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

  -- 3) Login correcto: resetea el contador de este correo y devuelve el usuario.
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

  -- 4) Login incorrecto: sube el contador de fallos para este correo.
  --    Al llegar a 3 fallos seguidos, bloquea 1 minuto y reinicia el
  --    contador (para que, pasado el minuto, vuelva a tener 3 intentos).
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

  -- Sin filas: login.js lo trata igual que "correo o contraseña incorrectos"
  -- (como ya hacía antes de este cambio).
  return;
end;
$$;

revoke all on function login_staff(text, text) from public;
grant execute on function login_staff(text, text) to anon, authenticated;

-- --------------------------------------------------------------------------
-- Limpieza: borra intentos viejos (correos que ya no insisten) para que la
-- tabla no crezca sola para siempre con emails probados por bots.
-- --------------------------------------------------------------------------
create extension if not exists pg_cron;

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

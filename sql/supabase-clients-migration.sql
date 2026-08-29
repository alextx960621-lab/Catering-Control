-- ==========================================================================
-- Catering Control · Migración: Clientes a tabla propia (una fila por cliente)
-- ==========================================================================
-- Por qué: hasta ahora, TODOS los clientes vivían juntos dentro de un solo
-- bloque de datos (db_clientes). Cada vez que se guardaba un cambio en un
-- solo cliente (una pausa, una edición), la app subía y bajaba la lista
-- COMPLETA de clientes. Con pocos clientes no se nota, pero con ~500 empieza
-- a pesar y a ser lento, sobre todo en el portal de autoservicio del cliente
-- (cliente.html), que antes descargaba a TODOS los clientes solo para
-- mostrarle el plan a UNO.
--
-- Qué hace este script: crea una tabla nueva (db_clientes_rows) con una fila
-- por cliente, copia ahí los clientes que ya tienes, y actualiza el login de
-- clientes para que use la tabla nueva.
--
-- IMPORTANTE — ORDEN DE PASOS:
--   1) Corre TODO este script en el SQL Editor de tu proyecto de Supabase.
--   2) Recién después de que corra sin errores, sube los archivos nuevos
--      (index.html, cliente.html, login.html, supabase-client.js) a tu
--      hosting. Si subes los archivos ANTES de correr este script, el panel
--      va a ver la lista de clientes vacía (porque busca en la tabla nueva,
--      que todavía no existe con datos).
--
-- Es seguro volver a correrlo (no duplica clientes ni borra tus datos).
-- ==========================================================================

set search_path = public, extensions;

-- 1) Tabla nueva: una fila por cliente.
create table if not exists db_clientes_rows (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table db_clientes_rows enable row level security;

drop policy if exists "public access clientes filas" on db_clientes_rows;
create policy "public access clientes filas" on db_clientes_rows for all using (true) with check (true);

-- 2) Copia cada cliente de la lista actual (dentro de db_clientes) a su
--    propia fila. Si el cliente ya existe en la tabla nueva, actualiza sus
--    datos en vez de duplicarlo.
insert into db_clientes_rows (id, payload)
select
  coalesce(c ->> 'id', gen_random_uuid()::text) as id,
  c as payload
from db_clientes, jsonb_array_elements(coalesce(payload -> 'clients', '[]'::jsonb)) as c
where db_clientes.id = 'main'
on conflict (id) do update set payload = excluded.payload, updated_at = now();

-- 3) Actualiza login_cliente para que busque en la tabla nueva (más rápido:
--    ya no recorre la lista completa de clientes en cada intento de login).
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

-- ==========================================================================
-- El arreglo "clients" que quedó dentro de db_clientes (payload->'clients')
-- NO se borró — queda ahí como respaldo por si necesitas revertir. La app
-- nueva ya no lo lee ni lo escribe: guarda y lee cada cliente en
-- db_clientes_rows. Cuando confirmes que todo funciona bien (unos días de
-- uso normal), puedes limpiarlo con:
--   update db_clientes set payload = payload - 'clients' where id = 'main';
-- ==========================================================================

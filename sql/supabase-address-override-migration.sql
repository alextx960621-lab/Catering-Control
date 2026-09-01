-- ==========================================================================
-- Catering Control · Migración: cambio de dirección activa desde el portal
-- de cliente (Objetivo 1 del prompt de direcciones múltiples).
-- ==========================================================================
-- Corre esto UNA vez en el SQL Editor de tu proyecto de Supabase (el mismo
-- proyecto donde ya corriste supabase-setup-full.sql). Es seguro volver a
-- correrlo si algo falla a mitad de camino (create or replace).
--
-- Qué hace: agrega la función set_client_address_override(), que el
-- portal de cliente (cliente.js) llama cuando el cliente elige a qué
-- dirección quiere que le llegue el pedido de MAÑANA. Toda la validación
-- ocurre en el servidor (no confía en el reloj del navegador del cliente):
--   1) Verifica que sean antes de las 22:00 hora Bolivia (America/La_Paz).
--   2) Verifica que la dirección elegida (p_address_id) realmente
--      pertenezca a ESE cliente (payload->addresses), para que un cliente
--      no pueda apuntar el pedido de otro cliente a su propia casa.
--   3) Guarda el cambio en payload.addressOverrides como
--      [{date, addressId}], reemplazando cualquier entrada que ya
--      existiera para esa misma fecha (no acumula duplicados).
--   4) NO toca activeAddressId (la dirección "de siempre" que administra
--      el panel de operaciones) ni el horario semanal (schedule) que arma
--      el admin — es solo una excepción puntual para un día.
-- Devuelve el array addressOverrides actualizado (jsonb), para que
-- cliente.js lo pueda usar directo sin tener que releer toda la fila.
-- ==========================================================================

set search_path = public, extensions;

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

  -- Quita cualquier entrada previa para esa misma fecha y agrega la nueva.
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

-- ==========================================================================
-- Nota: la tabla y la RLS de db_clientes_rows ya existen desde
-- supabase-setup-full.sql (policy "public access clientes filas", acceso
-- abierto con la clave publishable). Esta función usa SECURITY DEFINER
-- para poder validar/escribir aunque cambiaras esa policy más adelante.
-- ==========================================================================

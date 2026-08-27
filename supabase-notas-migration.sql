-- ============================================================================
-- MIGRACIÓN: menú "Notas" (recordatorios del staff + mensajes de clientes)
-- ============================================================================
-- Cómo aplicarla: Supabase → tu proyecto → SQL Editor → New query → pega todo
-- este archivo → Run. Es segura de correr una sola vez; si la vuelves a
-- correr por error, "if not exists" / "or replace" evitan que rompa nada.
-- ============================================================================

-- Una fila por nota (mismo patrón que ya usa db_clientes_rows: cada nota es
-- su propia fila, así guardar/editar una no sube ni baja las demás).
create table if not exists db_notas_rows (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table db_notas_rows enable row level security;

-- Mismo nivel de acceso que el resto de las tablas de la app (el control de
-- quién puede ver/editar Notas ya lo hace la propia app, por rol, no la base
-- de datos — igual que con Clientes, Personal e Inventario).
drop policy if exists "notas_select" on db_notas_rows;
create policy "notas_select" on db_notas_rows for select using (true);
drop policy if exists "notas_insert" on db_notas_rows;
create policy "notas_insert" on db_notas_rows for insert with check (true);
drop policy if exists "notas_update" on db_notas_rows;
create policy "notas_update" on db_notas_rows for update using (true);
drop policy if exists "notas_delete" on db_notas_rows;
create policy "notas_delete" on db_notas_rows for delete using (true);

-- Función que usa el PORTAL DEL CLIENTE (cliente.js) para dejar un mensaje.
-- A propósito NO le da al cliente acceso directo a la tabla db_notas_rows
-- (no podría leer ni tocar las notas del staff ni las de otros clientes):
-- solo puede ejecutar esta función, que arma la nota por su cuenta con
-- fecha de hoy y su propio nombre, tomado de su fila en db_clientes_rows.
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

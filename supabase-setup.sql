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

-- ============================================================================
-- Catering Control · Storage para imágenes (logo, foto publicitaria, fotos de
-- drivers/planes, íconos de menú, fotos de respaldo de entrega)
-- ============================================================================
-- Por qué: hoy esas imágenes viven como base64 DENTRO de las filas de
-- Postgres (db_personal, db_clientes, db_delivery_status). Eso significa que
-- CADA VEZ que la app lee esas filas -- que pasa muy seguido: al iniciar
-- sesión, en cada guardado, y cada 12s mientras Despacho está abierto -- se
-- vuelve a bajar el peso completo de todas esas imágenes juntas, aunque no
-- hayan cambiado. Eso es lo que está inflando la "Salida" (egress) del plan
-- gratuito de Supabase.
--
-- La solución: guardar las imágenes en un bucket de Storage y dejar en la
-- fila de Postgres solo la URL pública (un texto cortito). Las imágenes
-- entonces se sirven como cualquier archivo estático -- el navegador las
-- cachea normal -- y ya no viajan pegadas al JSON cada vez que se lee/graba
-- clientes/personal/delivery_status.
--
-- Cómo correr esto: Supabase Dashboard → SQL Editor → pegar y ejecutar
-- completo, una sola vez por proyecto (o por cliente, si administrás varios
-- tenants -- cada uno tiene su propio proyecto de Supabase con este mismo
-- script).
-- ============================================================================

-- 1) Crear el bucket (público: cualquiera con la URL puede VER la imagen,
--    igual que hoy con el base64 embebido -- no es información sensible).
insert into storage.buckets (id, name, public)
values ('app-images', 'app-images', true)
on conflict (id) do nothing;

-- 2) Policies del bucket.
-- Mismo criterio de seguridad que ya tiene el resto de la base (RLS abierto,
-- decisión tuya de prototipo sin autenticación real de Supabase todavía):
-- se permite subir/reemplazar/borrar con la clave publishable (anon), igual
-- que hoy se puede leer/escribir cualquier tabla db_* sin restricción.

drop policy if exists "app-images: lectura pública" on storage.objects;
create policy "app-images: lectura pública"
  on storage.objects for select
  using (bucket_id = 'app-images');

drop policy if exists "app-images: subir" on storage.objects;
create policy "app-images: subir"
  on storage.objects for insert
  with check (bucket_id = 'app-images');

drop policy if exists "app-images: reemplazar" on storage.objects;
create policy "app-images: reemplazar"
  on storage.objects for update
  using (bucket_id = 'app-images');

drop policy if exists "app-images: borrar" on storage.objects;
create policy "app-images: borrar"
  on storage.objects for delete
  using (bucket_id = 'app-images');

-- ============================================================================
-- Nota para cuando más adelante se agregue autenticación real de Supabase
-- (hoy el login es con usuarios propios en db_personal, no con Supabase Auth):
-- estas policies habría que endurecerlas a auth.role() = 'authenticated' en
-- vez de dejarlas abiertas a cualquiera con la clave publishable, igual que
-- el resto de las tablas db_*.
-- ============================================================================

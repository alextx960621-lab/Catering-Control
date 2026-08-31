-- Retención automática de auditoría: borra de db_audit_log todo lo de
-- más de 15 días, todos los días. Mismo patrón que ya usas para los
-- snapshots de despacho a 30 días (db_dispatch_snapshots).
--
-- Requisito: la extensión pg_cron debe estar habilitada en el proyecto.
-- Si ya la habilitaste para lo de los 30 días, esta línea no hace nada
-- (CREATE EXTENSION IF NOT EXISTS es segura de repetir):
create extension if not exists pg_cron;

-- Si ya tenías un cron con este mismo nombre (por ejemplo de una prueba
-- anterior), esto evita el error de "ya existe" al volver a correr el
-- script:
select cron.unschedule('borrar-auditoria-vieja')
where exists (select 1 from cron.job where jobname = 'borrar-auditoria-vieja');

-- Corre todos los días a las 04:00 UTC (00:00 hora Bolivia) y borra todo
-- registro de db_audit_log con más de 15 días de antigüedad según su
-- columna "at".
select cron.schedule(
  'borrar-auditoria-vieja',
  '0 4 * * *',
  $$delete from db_audit_log where at < now() - interval '15 days'$$
);

-- Para confirmar que quedó programado:
-- select * from cron.job where jobname = 'borrar-auditoria-vieja';

-- Para borrar el cron si algún día lo quieres desactivar:
-- select cron.unschedule('borrar-auditoria-vieja');

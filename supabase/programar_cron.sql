-- Ejecuta esto UNA vez en el SQL Editor de Supabase, después de desplegar la función.
-- La referencia de tu proyecto (hbkveqilauhqahwuuasc) ya está puesta.
-- Reemplaza TU_CODIGO por el valor del secreto CRON_TOKEN (supabase secrets set CRON_TOKEN=...).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Cada 5 minutos, al minuto 1 de cada vela (da tiempo a que el exchange publique la vela cerrada)
select cron.schedule(
  'senales-ob-5m',
  '1-56/5 * * * *',
  $$
  select net.http_post(
    url := 'https://hbkveqilauhqahwuuasc.supabase.co/functions/v1/senales-ob?k=TU_CODIGO',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Limpieza diaria
select cron.schedule('senales-limpieza', '15 3 * * *', $$ select public.limpiar_senales_enviadas(); $$);

-- Para detenerlo:  select cron.unschedule('senales-ob-5m');

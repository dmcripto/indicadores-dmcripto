-- Registro de señales ya enviadas (evita duplicados entre ejecuciones).
create table if not exists public.senales_enviadas (
  clave text primary key,
  creado timestamptz not null default now()
);

-- Solo la función (service role) accede: RLS activado y sin políticas públicas.
alter table public.senales_enviadas enable row level security;

-- Limpieza de registros viejos (más de 7 días) para que la tabla no crezca.
create or replace function public.limpiar_senales_enviadas() returns void
language sql as $$ delete from public.senales_enviadas where creado < now() - interval '7 days'; $$;

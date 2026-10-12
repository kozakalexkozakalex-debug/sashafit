-- SashaFit: чат тренер <-> клієнт. Виконати в Supabase: SQL Editor -> New query -> вставити -> Run.
-- Скрипт безпечно запускати повторно.

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  sender text not null check (sender in ('coach', 'client')),
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

drop policy if exists "messages coach all" on public.messages;
create policy "messages coach all" on public.messages for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

drop policy if exists "messages client select" on public.messages;
create policy "messages client select" on public.messages for select to authenticated
  using (client_id = public.my_client_id());

drop policy if exists "messages client insert" on public.messages;
create policy "messages client insert" on public.messages for insert to authenticated
  with check (client_id = public.my_client_id() and sender = 'client');

-- Realtime, щоб повідомлення з'являлись без перезавантаження сторінки.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

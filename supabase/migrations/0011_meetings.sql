-- SashaFit: онлайн-зустрічі для Головної. Виконати в Supabase: SQL Editor -> New query -> вставити -> Run.

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  title text not null,
  scheduled_at timestamptz not null,
  link text,
  note text,
  created_at timestamptz not null default now()
);

alter table public.meetings enable row level security;

-- Зустрічі бачить і керує ними лише тренер.
create policy "meetings coach all" on public.meetings for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

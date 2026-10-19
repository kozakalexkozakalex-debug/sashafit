-- SashaFit: трекінг звичок клієнта (вода/кроки/сон/довільні) — чекліст на день.
-- Виконати в Supabase: SQL Editor -> New query -> вставити -> Run.

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  label text not null,
  icon text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  date date not null,
  done boolean not null default true,
  created_at timestamptz not null default now(),
  unique (habit_id, date)
);

alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;

-- habits: тренер лише читає (для огляду), клієнт керує своїми звичками сам
create policy "habits coach read" on public.habits for select to authenticated
  using (public.is_coach());
create policy "habits own all" on public.habits for all to authenticated
  using (client_id = public.my_client_id()) with check (client_id = public.my_client_id());

-- habit_logs: тренер лише читає, клієнт відмічає свої дні сам
create policy "habit_logs coach read" on public.habit_logs for select to authenticated
  using (public.is_coach());
create policy "habit_logs own all" on public.habit_logs for all to authenticated
  using (habit_id in (select id from public.habits where client_id = public.my_client_id()))
  with check (habit_id in (select id from public.habits where client_id = public.my_client_id()));

-- SashaFit: бібліотека раціонів тренера. Выполнить в Supabase: SQL Editor -> New query -> вставить -> Run.

create table public.rations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz not null default now()
);

create table public.ration_items (
  id uuid primary key default gen_random_uuid(),
  ration_id uuid not null references public.rations(id) on delete cascade,
  name text not null,
  grams numeric,
  calories numeric not null default 0,
  protein numeric not null default 0,
  fat numeric not null default 0,
  carbs numeric not null default 0,
  position int not null default 0
);

alter table public.rations enable row level security;
alter table public.ration_items enable row level security;

-- Бібліотека раціонів — лише тренер (клієнту не потрібна напряму, він бачить вже скопійовані записи).
create policy "rations coach all" on public.rations for all to authenticated
  using (public.is_coach()) with check (public.is_coach());
create policy "ration_items coach all" on public.ration_items for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

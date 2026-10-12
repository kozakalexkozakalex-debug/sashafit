-- SashaFit: харчування (ціль + щоденник). Выполнить в Supabase: SQL Editor -> New query -> вставить -> Run.

create table public.nutrition_targets (
  client_id uuid primary key references public.clients(id) on delete cascade,
  calories numeric,
  protein numeric,
  fat numeric,
  carbs numeric,
  updated_at timestamptz not null default now()
);

create table public.food_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  date date not null,
  name text not null,
  grams numeric,
  calories numeric not null default 0,
  protein numeric not null default 0,
  fat numeric not null default 0,
  carbs numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.nutrition_targets enable row level security;
alter table public.food_entries enable row level security;

-- nutrition_targets: тренер керує всім; клієнт лише читає свою ціль
create policy "nutrition_targets coach all" on public.nutrition_targets for all to authenticated
  using (public.is_coach()) with check (public.is_coach());
create policy "nutrition_targets own read" on public.nutrition_targets for select to authenticated
  using (client_id = public.my_client_id());

-- food_entries: тренер бачить усе (без редагування чужого щоденника); клієнт керує своїми записами
create policy "food_entries coach read" on public.food_entries for select to authenticated
  using (public.is_coach());
create policy "food_entries own all" on public.food_entries for all to authenticated
  using (client_id = public.my_client_id()) with check (client_id = public.my_client_id());

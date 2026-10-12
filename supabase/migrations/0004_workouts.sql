-- SashaFit: тренування. Выполнить в Supabase: SQL Editor -> New query -> вставить -> Run.

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  name text not null,
  sets int,
  reps text,
  position int not null default 0,
  done boolean not null default false
);

alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;

-- workouts: тренер керує всім; клієнт бачить лише свої
create policy "workouts coach all" on public.workouts for all to authenticated
  using (public.is_coach()) with check (public.is_coach());
create policy "workouts own read" on public.workouts for select to authenticated
  using (client_id = public.my_client_id());

-- workout_exercises: тренер керує всім; клієнт бачить свої і може відмічати done (update)
create policy "workout_exercises coach all" on public.workout_exercises for all to authenticated
  using (public.is_coach()) with check (public.is_coach());
create policy "workout_exercises own read" on public.workout_exercises for select to authenticated
  using (workout_id in (select id from public.workouts where client_id = public.my_client_id()));
create policy "workout_exercises own update done" on public.workout_exercises for update to authenticated
  using (workout_id in (select id from public.workouts where client_id = public.my_client_id()))
  with check (workout_id in (select id from public.workouts where client_id = public.my_client_id()));

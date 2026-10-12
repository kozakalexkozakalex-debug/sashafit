-- SashaFit: конструктор програм тренувань + календарне призначення.
-- Замінює просту модель із 0004. Выполнить в Supabase: SQL Editor -> New query -> вставить -> Run.

-- Прибираємо попередню просту модель (якщо міграцію 0004 вже застосовували).
drop table if exists public.workout_exercises;
drop table if exists public.workouts;

-- 1. Бібліотека програм тренера (переіспользовується для різних клієнтів).
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz not null default now()
);

create table public.program_days (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  title text not null,
  position int not null default 0
);

create table public.program_exercises (
  id uuid primary key default gen_random_uuid(),
  program_day_id uuid not null references public.program_days(id) on delete cascade,
  name text not null,
  sets int,
  reps text,
  position int not null default 0
);

-- 2. Призначені тренування: конкретний день програми на конкретну дату конкретному клієнту.
-- Вправи копіюються в assigned_workout_exercises (знімок) — редагування програми потім
-- не ламає вже призначені/виконані тренування.
create table public.assigned_workouts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  date date not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.assigned_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  assigned_workout_id uuid not null references public.assigned_workouts(id) on delete cascade,
  name text not null,
  sets int,
  reps text,
  position int not null default 0
);

-- 3. RLS: уся бібліотека програм — тільки тренер (клієнту не потрібна).
alter table public.programs enable row level security;
alter table public.program_days enable row level security;
alter table public.program_exercises enable row level security;

create policy "programs coach all" on public.programs for all to authenticated
  using (public.is_coach()) with check (public.is_coach());
create policy "program_days coach all" on public.program_days for all to authenticated
  using (public.is_coach()) with check (public.is_coach());
create policy "program_exercises coach all" on public.program_exercises for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- 4. RLS: призначені тренування — тренер керує всім; клієнт бачить свої і може відмічати виконання.
alter table public.assigned_workouts enable row level security;
alter table public.assigned_workout_exercises enable row level security;

create policy "assigned_workouts coach all" on public.assigned_workouts for all to authenticated
  using (public.is_coach()) with check (public.is_coach());
create policy "assigned_workouts own read" on public.assigned_workouts for select to authenticated
  using (client_id = public.my_client_id());
create policy "assigned_workouts own complete" on public.assigned_workouts for update to authenticated
  using (client_id = public.my_client_id()) with check (client_id = public.my_client_id());

create policy "assigned_workout_exercises coach all" on public.assigned_workout_exercises for all to authenticated
  using (public.is_coach()) with check (public.is_coach());
create policy "assigned_workout_exercises own read" on public.assigned_workout_exercises for select to authenticated
  using (assigned_workout_id in (select id from public.assigned_workouts where client_id = public.my_client_id()));

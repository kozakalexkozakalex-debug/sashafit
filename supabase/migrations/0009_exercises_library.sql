-- SashaFit: база вправ для конструктора програм. Виконати в Supabase: SQL Editor -> New query -> вставити -> Run.

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_group text,
  equipment text,
  description text,
  photo_path text,
  video_url text,
  created_at timestamptz not null default now()
);

alter table public.exercises enable row level security;

-- Базу вправ бачить і керує лише тренер.
create policy "exercises coach all" on public.exercises for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- Зв'язок вправи з конкретним використанням у програмі / призначеному тренуванні
-- (назва все одно копіюється "знімком", зв'язок потрібен лише для показу фото/відео).
alter table public.program_exercises
  add column if not exists exercise_id uuid references public.exercises(id) on delete set null;

alter table public.assigned_workout_exercises
  add column if not exists exercise_id uuid references public.exercises(id) on delete set null;

-- Публічний бакет для фото вправ (демонстрація техніки — не приватні дані).
insert into storage.buckets (id, name, public)
values ('exercises', 'exercises', true)
on conflict (id) do nothing;

create policy "exercises photos public read" on storage.objects for select
  using (bucket_id = 'exercises');

create policy "exercises photos coach write" on storage.objects for insert to authenticated
  with check (bucket_id = 'exercises' and public.is_coach());

create policy "exercises photos coach update" on storage.objects for update to authenticated
  using (bucket_id = 'exercises' and public.is_coach());

create policy "exercises photos coach delete" on storage.objects for delete to authenticated
  using (bucket_id = 'exercises' and public.is_coach());

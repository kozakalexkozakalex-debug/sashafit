-- SashaFit: дневник тренировок — факт. вес/повторы и отметка по каждой вправе.
-- Выполнить в Supabase: SQL Editor -> New query -> вставить -> Run.

alter table public.assigned_workout_exercises
  add column if not exists actual_weight numeric,
  add column if not exists actual_reps text,
  add column if not exists done boolean not null default false;

-- Клієнт раніше міг тільки читати свої вправи — тепер дозволяємо йому
-- записувати факт. вагу/повтори/відмітку "виконано" по своїх тренуваннях.
drop policy if exists "assigned_workout_exercises own update" on public.assigned_workout_exercises;
create policy "assigned_workout_exercises own update" on public.assigned_workout_exercises
  for update to authenticated
  using (assigned_workout_id in (select id from public.assigned_workouts where client_id = public.my_client_id()))
  with check (assigned_workout_id in (select id from public.assigned_workouts where client_id = public.my_client_id()));

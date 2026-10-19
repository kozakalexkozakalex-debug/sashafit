-- Логгер тренувань 2.0: опційна оцінка важкості підходу (RPE, 1-10).
-- Виконати в Supabase: SQL Editor -> New query -> вставити -> Run.
alter table public.assigned_workout_exercises add column if not exists rpe smallint;

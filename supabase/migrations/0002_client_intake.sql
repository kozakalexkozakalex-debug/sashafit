-- SashaFit: поля анкеты клиента. Выполнить в Supabase: SQL Editor -> New query -> вставить -> Run.

alter table public.clients
  add column if not exists height numeric,
  add column if not exists start_weight numeric,
  add column if not exists target_weight numeric,
  add column if not exists intake_notes text;

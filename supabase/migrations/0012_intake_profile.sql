-- SashaFit: розширена анкета клієнта. Виконати в Supabase: SQL Editor -> New query -> вставити -> Run.

alter table public.clients
  add column if not exists intake_goals text,
  add column if not exists experience_level text,
  add column if not exists health_restrictions text,
  add column if not exists training_location text,
  add column if not exists equipment text,
  add column if not exists training_days_per_week integer,
  add column if not exists food_restrictions text,
  add column if not exists lifestyle text;

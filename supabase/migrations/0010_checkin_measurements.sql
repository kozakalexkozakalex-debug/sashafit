-- SashaFit: замери в чек-іні (талія/стегна/груди). Виконати в Supabase: SQL Editor -> New query -> вставити -> Run.

alter table public.checkins
  add column if not exists waist numeric,
  add column if not exists hips numeric,
  add column if not exists chest numeric;

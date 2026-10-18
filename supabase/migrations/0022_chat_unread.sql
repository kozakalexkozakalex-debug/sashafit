-- SashaFit: відмітки "прочитано" для чату, щоб показувати бейдж з непрочитаними.
-- Виконати в Supabase: SQL Editor -> New query -> вставити -> Run. Скрипт безпечно запускати повторно.

alter table public.clients add column if not exists coach_last_read_at timestamptz;
alter table public.clients add column if not exists client_last_read_at timestamptz;

-- Нові колонки на таблиці clients, тож RLS-політики "clients coach all" (повний доступ тренера)
-- і "clients self update" (клієнт оновлює свій рядок) з попередніх міграцій вже покривають їх.

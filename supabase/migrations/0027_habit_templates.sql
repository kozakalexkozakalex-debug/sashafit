-- SashaFit: бібліотека звичок тренера (шаблони типу "Вода", "Кроки", "Сон",
-- свої власні) — щоб не вигадувати звички кожному клієнту з нуля, а швидко
-- призначати з готового списку. Самі звички клієнта (таблиця habits) лишились
-- без змін — призначення просто створює копії-рядки в habits для клієнта.
-- Виконати в Supabase: SQL Editor -> New query -> вставити -> Run.

create table public.habit_templates (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  icon text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.habit_templates enable row level security;

-- тренер керує бібліотекою, клієнт теж може читати (не приватні дані)
create policy "habit_templates coach write" on public.habit_templates for all to authenticated
  using (public.is_coach()) with check (public.is_coach());
create policy "habit_templates read all" on public.habit_templates for select to authenticated
  using (true);

-- SashaFit: кастомні питання чек-іна (тренер сам налаштовує, що питати
-- додатково — сон/стрес/самопочуття/довільний коментар).
-- Виконати в Supabase: SQL Editor -> New query -> вставити -> Run.

create table public.checkin_questions (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  kind text not null default 'text' check (kind in ('text', 'scale')),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.checkin_answers (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  question_id uuid not null references public.checkin_questions(id) on delete cascade,
  value text,
  unique (checkin_id, question_id)
);

alter table public.checkin_questions enable row level security;
alter table public.checkin_answers enable row level security;

-- checkin_questions: тренер керує, усі залогінені можуть читати (щоб клієнт
-- бачив питання при заповненні чек-іна) — там тільки текст питань, нічого
-- приватного.
create policy "checkin_questions coach write" on public.checkin_questions for all to authenticated
  using (public.is_coach()) with check (public.is_coach());
create policy "checkin_questions read all" on public.checkin_questions for select to authenticated
  using (true);

-- checkin_answers: тренер лише читає; клієнт керує відповідями до своїх чек-інів
create policy "checkin_answers coach read" on public.checkin_answers for select to authenticated
  using (public.is_coach());
create policy "checkin_answers own all" on public.checkin_answers for all to authenticated
  using (checkin_id in (select id from public.checkins where client_id = public.my_client_id()))
  with check (checkin_id in (select id from public.checkins where client_id = public.my_client_id()));

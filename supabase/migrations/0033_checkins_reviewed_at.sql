-- SashaFit: позначка "чек-ін перевірено тренером" — для черги "Потрібно зробити"
-- на головній. Нові чек-іни мають reviewed_at = null, тренер ставить дату,
-- коли перевірив. Існуючі чек-іни вважаємо вже перевіреними, щоб вони не
-- заповнили чергу.
-- RLS не змінюємо: політика "checkins coach all" уже дозволяє тренеру update.

alter table public.checkins add column if not exists reviewed_at timestamptz;

update public.checkins set reviewed_at = created_at where reviewed_at is null;

create index if not exists checkins_unreviewed_idx
  on public.checkins (created_at desc) where reviewed_at is null;

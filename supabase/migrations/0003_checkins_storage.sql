-- SashaFit: сховище для фото чек-інів. Выполнить в Supabase: SQL Editor -> New query -> вставить -> Run.

-- Приватний бакет для фото (доступ лише через підписані посилання, не публічний).
insert into storage.buckets (id, name, public)
values ('checkins', 'checkins', false)
on conflict (id) do nothing;

-- Файли лежать за шляхом "<client_id>/<timestamp>-<ім'я файлу>".
-- Тренер бачить усі фото; клієнт — лише свої (перша частина шляху = his client_id).
create policy "checkins photos coach read" on storage.objects for select to authenticated
  using (bucket_id = 'checkins' and public.is_coach());

create policy "checkins photos own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'checkins' and public.my_client_id() = (split_part(name, '/', 1))::uuid);

create policy "checkins photos own read" on storage.objects for select to authenticated
  using (bucket_id = 'checkins' and public.my_client_id() = (split_part(name, '/', 1))::uuid);

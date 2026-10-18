-- Фото профілю клієнта (аватар в картці анкети).
alter table public.clients add column if not exists avatar_path text;

-- Приватний бакет для аватарів (доступ лише через підписані посилання).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- Файли лежать за шляхом "<client_id>/<timestamp>-<ім'я файлу>".
-- Тренер бачить усі аватари; клієнт — лише свій (перша частина шляху = his client_id).
create policy "avatars coach read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.is_coach());

create policy "avatars own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.my_client_id() = (split_part(name, '/', 1))::uuid);

create policy "avatars own read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.my_client_id() = (split_part(name, '/', 1))::uuid);

create policy "avatars own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.my_client_id() = (split_part(name, '/', 1))::uuid);

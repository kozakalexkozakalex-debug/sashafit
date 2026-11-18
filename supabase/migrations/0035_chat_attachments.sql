-- Фото і відео в чаті. Файли лежать у приватному бакеті "chat" у папці
-- з id клієнта: клієнт бачить і вантажить лише своє, тренер — усе.
alter table public.messages
  add column if not exists attachment_path text,
  add column if not exists attachment_kind text check (attachment_kind in ('image', 'video'));

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat', 'chat', false, 52428800)
on conflict (id) do nothing;

create policy "chat insert own or coach" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat'
    and (my_client_id() = (split_part(name, '/', 1))::uuid or is_coach())
  );

create policy "chat read own or coach" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat'
    and (my_client_id() = (split_part(name, '/', 1))::uuid or is_coach())
  );

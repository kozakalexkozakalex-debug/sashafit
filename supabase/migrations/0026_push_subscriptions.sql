-- SashaFit: push-підписки клієнтів (Web Push) — для нагадувань про
-- тренування сьогодні і чек-ін у неділю.
-- Виконати в Supabase: SQL Editor -> New query -> вставити -> Run.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Клієнт керує своєю підпискою сам (з браузера); серверний cron читає все
-- через service-role ключ, який обходить RLS — тренеру окремий доступ не потрібен.
create policy "push_subscriptions own all" on public.push_subscriptions for all to authenticated
  using (client_id = public.my_client_id()) with check (client_id = public.my_client_id());

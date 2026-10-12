-- SashaFit: ручне відстеження оплат/підписки. Выполнить в Supabase: SQL Editor -> New query -> вставить -> Run.

alter table public.clients
  add column if not exists subscription_until date;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  amount numeric,
  paid_at date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

alter table public.payments enable row level security;

-- Оплати бачить і керує ними лише тренер.
create policy "payments coach all" on public.payments for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

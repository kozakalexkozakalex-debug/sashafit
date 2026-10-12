-- SashaFit: власна база продуктів (для раціонів і щоденника харчування).
-- Виконати в Supabase: SQL Editor -> New query -> вставити -> Run.

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  calories_per_100 numeric not null default 0,
  protein_per_100 numeric not null default 0,
  fat_per_100 numeric not null default 0,
  carbs_per_100 numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;

-- Базу продуктів бачать усі залогінені (і тренер, і клієнти — для вибору продукту).
create policy "products read all" on public.products for select to authenticated
  using (true);

-- Додає/змінює/видаляє продукти лише тренер.
create policy "products coach insert" on public.products for insert to authenticated
  with check (public.is_coach());
create policy "products coach update" on public.products for update to authenticated
  using (public.is_coach()) with check (public.is_coach());
create policy "products coach delete" on public.products for delete to authenticated
  using (public.is_coach());

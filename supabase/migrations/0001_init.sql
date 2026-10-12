-- SashaFit: базовые таблицы (MVP). Выполнить в Supabase: SQL Editor -> New query -> вставить -> Run.

-- 1. Профили: каждый пользователь (и тренер, и клиент) — это запись в auth.users + одна строка здесь.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'client' check (role in ('coach', 'client')),
  full_name text,
  created_at timestamptz not null default now()
);

-- 2. Клиенты: карточка клиента у тренера. Пока клиент не зарегистрировался по ссылке — profile_id пустой.
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references auth.users(id) on delete set null,
  invite_code text unique not null default substr(md5(random()::text), 1, 8),
  name text not null,
  goal text,
  created_at timestamptz not null default now()
);

-- 3. Чек-ины: вес + фото раз в неделю.
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  weight numeric,
  photo_path text,
  comment text,
  created_at timestamptz not null default now()
);

-- 4. Вспомогательные функции для правил доступа.
create or replace function public.is_coach() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'coach');
$$;

create or replace function public.my_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.clients where profile_id = auth.uid() limit 1;
$$;

-- Клиент заходит по ссылке-приглашению и привязывает свой аккаунт к карточке.
create or replace function public.claim_invite(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.clients set profile_id = auth.uid()
   where invite_code = code and profile_id is null
  returning id into cid;
  if cid is null then
    raise exception 'invite not found or already used';
  end if;
  return cid;
end;
$$;

-- 5. При регистрации нового пользователя (email/пароль или Google) автоматически создаём profiles-запись.
-- Роль по умолчанию — 'client'; себе как тренеру роль поставишь вручную одной командой (шаг 4 ниже).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name)
  values (new.id, 'client', coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 6. Row Level Security: включаем на всех таблицах и задаём правила.
alter table public.profiles enable row level security;
alter table public.clients  enable row level security;
alter table public.checkins enable row level security;

-- profiles: видеть можно себя; тренер видит всех
create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_coach());

-- clients: тренер управляет всем; клиент видит только свою карточку
create policy "clients coach all" on public.clients for all to authenticated
  using (public.is_coach()) with check (public.is_coach());
create policy "clients self read" on public.clients for select to authenticated
  using (profile_id = auth.uid());

-- checkins: тренер видит все; клиент видит и добавляет только свои
create policy "checkins coach all" on public.checkins for all to authenticated
  using (public.is_coach()) with check (public.is_coach());
create policy "checkins own" on public.checkins for all to authenticated
  using (client_id = public.my_client_id()) with check (client_id = public.my_client_id());

-- Анонимным (не вошедшим) пользователям таблицы не нужны.
revoke all on all tables in schema public from anon;
revoke all on function public.is_coach() from public, anon;
revoke all on function public.my_client_id() from public, anon;
revoke all on function public.claim_invite(text) from public, anon;
grant execute on function public.is_coach() to authenticated;
grant execute on function public.my_client_id() to authenticated;
grant execute on function public.claim_invite(text) to authenticated;

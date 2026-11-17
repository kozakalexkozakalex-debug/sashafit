-- Вхід через Telegram Mini App: зберігаємо Telegram ID користувача в профілі.
-- Унікальний — один Telegram-акаунт відповідає одному профілю.
alter table public.profiles
  add column if not exists telegram_id bigint unique;

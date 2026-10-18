-- Тренер може створити клієнта без імені — просто щоб отримати
-- invite-посилання. Ім'я клієнт вписує сам під час заповнення анкети.
alter table public.clients alter column name drop not null;

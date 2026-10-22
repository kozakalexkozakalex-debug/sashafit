-- Тренер тепер може призначити кожному клієнту свій день тижня для чек-іна
-- (раніше був жорстко зашитий один день — неділя — для всіх).
-- 0 = неділя ... 6 = субота (як JS Date.getDay()), за замовчуванням неділя,
-- щоб нічого не зламати для вже існуючих клієнтів.

alter table public.clients
  add column checkin_weekday smallint not null default 0
  check (checkin_weekday between 0 and 6);

-- Прийом їжі (Сніданок/Обід/Вечеря/Перекус) для запису харчування —
-- щоб звітність виглядала секціями, а не суцільним списком.
alter table public.food_entries add column if not exists meal text;

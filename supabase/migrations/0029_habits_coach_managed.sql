-- Звички тепер призначає тренер (як і задумано), клієнт лише відмічає
-- виконання. Раніше клієнт мав повний контроль (сам додавав/видаляв), а
-- тренер мав лише читання — через це кнопка "Призначити звички" в
-- тренера фактично не працювала (insert блокувався RLS).

drop policy if exists "habits own all" on public.habits;
drop policy if exists "habits coach read" on public.habits;

-- клієнт бачить тільки свої звички, але не може сам їх створювати/видаляти
create policy "habits client read" on public.habits for select to authenticated
  using (client_id = public.my_client_id());

-- тренер керує звичками всіх клієнтів (додає/редагує/видаляє)
create policy "habits coach write" on public.habits for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

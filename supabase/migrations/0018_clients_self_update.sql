-- Клієнт раніше міг лише читати свою картку (policy "clients self read"),
-- а право на оновлення (заповнення анкети, зміна ваги тощо) ніколи не було
-- створено — через це збереження анкети мовчки нічого не зберігало.
create policy "clients self update" on public.clients for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- handle_new_user() — тригер-функція (створює профіль при реєстрації).
-- Advisor знайшов, що її можна було викликати напряму через API (/rest/v1/rpc/handle_new_user),
-- хоча так ніхто й не має робити. Прибираємо прямий доступ; на спрацювання тригера
-- при реєстрації це не впливає — тригери не залежать від цього дозволу.
revoke execute on function public.handle_new_user() from anon, authenticated;

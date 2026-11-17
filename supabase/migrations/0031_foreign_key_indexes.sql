-- Індекси на зовнішніх ключах (рекомендація Supabase Performance Advisor):
-- без них вибірки "всі записи клієнта" і з'єднання таблиць повільнішають
-- у міру росту даних.
create index if not exists idx_assigned_workout_exercises_workout on public.assigned_workout_exercises (assigned_workout_id);
create index if not exists idx_assigned_workout_exercises_exercise on public.assigned_workout_exercises (exercise_id);
create index if not exists idx_assigned_workouts_client_date on public.assigned_workouts (client_id, date);
create index if not exists idx_checkin_answers_question on public.checkin_answers (question_id);
create index if not exists idx_checkins_client_created on public.checkins (client_id, created_at desc);
create index if not exists idx_food_entries_client_date on public.food_entries (client_id, date);
create index if not exists idx_habits_client on public.habits (client_id);
create index if not exists idx_meetings_client on public.meetings (client_id);
create index if not exists idx_messages_client on public.messages (client_id);
create index if not exists idx_payments_client on public.payments (client_id);
create index if not exists idx_program_days_program on public.program_days (program_id);
create index if not exists idx_program_exercises_exercise on public.program_exercises (exercise_id);
create index if not exists idx_program_exercises_day on public.program_exercises (program_day_id);
create index if not exists idx_push_subscriptions_client on public.push_subscriptions (client_id);
create index if not exists idx_ration_items_ration on public.ration_items (ration_id);

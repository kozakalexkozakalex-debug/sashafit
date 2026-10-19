import { createClient } from "@supabase/supabase-js";

// Серверний клієнт із service_role ключем — обходить RLS. Використовувати
// ТІЛЬКИ в серверному коді (API routes), ніколи в браузері, і ніколи не
// передавати цей ключ у NEXT_PUBLIC_ змінну.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getSupabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Не заповнено NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

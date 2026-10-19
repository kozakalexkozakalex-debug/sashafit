import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Не заповнено NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY в .env.local"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Явно вмикаємо (це й так дефолт, але фіксуємо, щоб не залежати від
    // змін дефолтів бібліотеки): сесія зберігається в localStorage браузера
    // і виживає закриття вкладки/застосунку — вихід тільки по кнопці "Вийти".
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

"use client";

import { useEffect } from "react";
import { applyTheme, readPrefs } from "@/lib/theme";

// Повторно застосовує тему після завантаження сторінки (тоді вже відомий
// colorScheme Telegram) і фарбує шапку Telegram. Перше фарбування робить
// скрипт у <head>, щоб екран не блимав.
export default function ThemeInit() {
  useEffect(() => {
    const { theme, mode } = readPrefs();
    applyTheme(theme, mode);
    const wa = (window as unknown as {
      Telegram?: { WebApp?: { onEvent?: (e: string, cb: () => void) => void; offEvent?: (e: string, cb: () => void) => void } };
    }).Telegram?.WebApp;
    const onChange = () => {
      const p = readPrefs();
      applyTheme(p.theme, p.mode);
    };
    wa?.onEvent?.("themeChanged", onChange);
    return () => wa?.offEvent?.("themeChanged", onChange);
  }, []);
  return null;
}

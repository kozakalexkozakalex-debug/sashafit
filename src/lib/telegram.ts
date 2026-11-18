"use client";

import { useEffect } from "react";

// Тонка обгортка над Telegram Mini App API. Поза Telegram (звичайний браузер)
// усе мовчки не робить нічого, тож викликати можна без перевірок.

type TgWebApp = {
  HapticFeedback?: {
    impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred?: (type: "error" | "success" | "warning") => void;
    selectionChanged?: () => void;
  };
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
};

export function tgApp(): TgWebApp | null {
  if (typeof window === "undefined") return null;
  const wa = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  return wa ?? null;
}

export function haptic(kind: "tap" | "select" | "success" | "error") {
  try {
    const h = tgApp()?.HapticFeedback;
    if (!h) return;
    if (kind === "tap") h.impactOccurred?.("light");
    else if (kind === "select") h.selectionChanged?.();
    else h.notificationOccurred?.(kind);
  } catch {
    // вібрація — дрібниця, не ламаємо через неї екран
  }
}

// Кнопка «Назад» у шапці Telegram: показуємо, поки відкрито вкладений екран
// чи шторка, і ховаємо, коли закрили. Кілька екранів можуть її замовляти по черзі.
export function useTelegramBack(active: boolean, onBack: () => void) {
  useEffect(() => {
    const btn = tgApp()?.BackButton;
    if (!active || !btn) return;
    btn.show();
    btn.onClick(onBack);
    return () => {
      btn.offClick(onBack);
      btn.hide();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

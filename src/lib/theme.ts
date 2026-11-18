// Теми SashaFit. Вибір зберігається на пристрої (localStorage): тема —
// "sf_theme", режим — "sf_mode" (auto = як у Telegram/телефону).
// Самі кольори лежать у globals.css, тут — лише перемикання атрибутів на <html>.

export type ThemeId = "violet" | "mono" | "orange";
export type ModePref = "auto" | "dark" | "light";

export const DEFAULT_THEME: ThemeId = "orange";

export const THEMES: {
  id: ThemeId;
  label: string;
  hint: string;
  // Кольори для прев'ю-плиток: фон, картка, головний акцент, дрібний акцент.
  dark: [string, string, string, string];
  light: [string, string, string, string];
}[] = [
  {
    id: "violet",
    label: "Фіалка і лайм",
    hint: "Темно-фіолетова, лайм лише на головній кнопці",
    dark: ["#130F24", "#221B40", "#C4EB3F", "#A992FF"],
    light: ["#F4F1FF", "#FFFFFF", "#5B3BD8", "#5B3BD8"],
  },
  {
    id: "mono",
    label: "Чорно-біла",
    hint: "Без кольору, лише крапки статусів",
    dark: ["#0B0B0C", "#1A1A1D", "#F5F5F5", "#F5F5F5"],
    light: ["#F5F5F5", "#FFFFFF", "#0B0B0C", "#0B0B0C"],
  },
  {
    id: "orange",
    label: "Графіт і апельсин",
    hint: "Графітова з теплим оранжевим",
    dark: ["#15171B", "#232630", "#E8773A", "#E8773A"],
    light: ["#F4F2EE", "#FFFFFF", "#BC4A13", "#BC4A13"],
  },
];

function isTheme(v: string | null): v is ThemeId {
  return v === "violet" || v === "mono" || v === "orange";
}

export function readPrefs(): { theme: ThemeId; mode: ModePref } {
  try {
    const t = localStorage.getItem("sf_theme");
    const m = localStorage.getItem("sf_mode");
    return {
      theme: isTheme(t) ? t : DEFAULT_THEME,
      mode: m === "dark" || m === "light" || m === "auto" ? m : "auto",
    };
  } catch {
    return { theme: DEFAULT_THEME, mode: "auto" };
  }
}

export function resolveMode(pref: ModePref): "dark" | "light" {
  if (pref !== "auto") return pref;
  const tg = (window as unknown as { Telegram?: { WebApp?: { colorScheme?: string } } }).Telegram?.WebApp;
  if (tg?.colorScheme === "light" || tg?.colorScheme === "dark") return tg.colorScheme;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(theme: ThemeId, modePref: ModePref) {
  const mode = resolveMode(modePref);
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-mode", mode);
  // Підлаштовуємо шапку й фон вікна Telegram під обраний фон застосунку.
  try {
    const paper = getComputedStyle(root).getPropertyValue("--c-paper").trim().split(" ").map(Number);
    if (paper.length === 3) {
      const hex = "#" + paper.map((n) => n.toString(16).padStart(2, "0")).join("");
      const wa = (window as unknown as {
        Telegram?: { WebApp?: { setHeaderColor?: (c: string) => void; setBackgroundColor?: (c: string) => void } };
      }).Telegram?.WebApp;
      wa?.setHeaderColor?.(hex);
      wa?.setBackgroundColor?.(hex);
    }
  } catch {
    /* ігноруємо — поза Telegram цих методів немає */
  }
}

export function saveAndApply(theme: ThemeId, mode: ModePref) {
  try {
    localStorage.setItem("sf_theme", theme);
    localStorage.setItem("sf_mode", mode);
  } catch {
    /* ігноруємо — немає доступу до localStorage */
  }
  applyTheme(theme, mode);
}

import type { Config } from "tailwindcss";

// Кольори беремо зі змінних CSS (див. globals.css) — так тема перемикається
// без перебудови: <html data-theme="..." data-mode="dark|light">.
const c = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        paper: c("paper"),
        surface: c("surface"),
        sidebar: c("sidebar"),
        ink: c("ink"),
        muted: c("muted"),
        line: c("line"),
        // accent — заливка головних кнопок; brand — дрібні акценти (текст,
        // активна вкладка, рамки). У більшості тем це один колір.
        accent: c("accent"),
        brand: c("brand"),
        success: c("success"),
        warn: c("warn"),
        danger: c("danger"),
        info: c("info"),
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-body)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;

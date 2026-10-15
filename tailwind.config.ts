import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        paper: "#15171B",
        surface: "#232630",
        ink: "#F7F6F2",
        muted: "#9B9B9E",
        line: "#3C4150",
        accent: "#F0702F",
        sidebar: "#1B1E25",
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;

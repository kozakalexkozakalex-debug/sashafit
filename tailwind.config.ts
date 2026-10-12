import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        paper: "#0B0B0C",
        surface: "#161617",
        ink: "#F5F1EA",
        muted: "#A39C92",
        line: "#2C2C2E",
        accent: "#FF7A1A",
      },
    },
  },
  plugins: [],
};
export default config;

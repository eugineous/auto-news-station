import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        "ppp-purple": "#6C3BFF",
        "ppp-teal": "#16d9e3",
        "ppp-blue": "#0ea5e9",
      },
      boxShadow: {
        glow: "0 10px 60px -15px rgba(45,212,191,0.45)",
      },
    },
  },
  plugins: [],
} satisfies Config;

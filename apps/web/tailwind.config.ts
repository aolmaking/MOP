import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#101114",
          900: "#191b20",
          700: "#373b45",
          500: "#626977"
        },
        signal: {
          red: "#c92b2b",
          rose: "#f7e8e8",
          gold: "#d79a2b",
          green: "#217a55",
          blue: "#2563eb"
        }
      },
      boxShadow: {
        panel: "0 24px 70px rgba(16, 17, 20, 0.12)"
      }
    }
  },
  plugins: []
} satisfies Config;

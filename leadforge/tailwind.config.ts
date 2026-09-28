import type { Config } from "tailwindcss";

const c = (v: string) => `hsl(var(--${v}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: c("bg"),
        fg: c("fg"),
        muted: c("muted"),
        "muted-fg": c("muted-fg"),
        card: c("card"),
        border: c("border"),
        primary: c("primary"),
        "primary-fg": c("primary-fg"),
        accent: c("accent"),
        success: c("success"),
        warning: c("warning"),
        danger: c("danger"),
        info: c("info"),
      },
      borderRadius: { lg: "12px", md: "8px", sm: "6px" },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "fade-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: { "fade-in": "fade-in .2s ease-out" },
    },
  },
  plugins: [],
} satisfies Config;

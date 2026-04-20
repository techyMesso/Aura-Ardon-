import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      // ─── Brand Color Palette ────────────────────────────────
      colors: {
        background: "#f8f4ec",
        foreground: "#1f1710",
        cream:      "#fdf8f0",
        sand:       "#e6d7c3",
        champagne:  "#c49d52",
        gold:       "#d4a843",
        bronze:     "#8b5e34",
        ink:        "#2e241b",
        card:       "#fffaf4",
        border:     "#d8c8b4",
        muted:      "#6f6256",
        rose:       "#c9897a",
      },

      // ─── Typography ─────────────────────────────────────────
      fontFamily: {
        serif: ["var(--font-display)", "Garamond", "Georgia", "serif"],
        sans:  ["var(--font-body)", "system-ui", "sans-serif"],
      },

      // ─── Shadows ────────────────────────────────────────────
      boxShadow: {
        luxe:  "0 20px 70px rgba(31, 23, 16, 0.09)",
        card:  "0 4px 24px rgba(31, 23, 16, 0.06)",
        glow:  "0 0 48px rgba(196, 157, 82, 0.25)",
        inner: "inset 0 2px 8px rgba(31, 23, 16, 0.06)",
      },

      // ─── Border Radius ──────────────────────────────────────
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.5rem",
      },

      // ─── Spacing additions ──────────────────────────────────
      height: {
        nav: "72px",
      },

      // ─── Animations ─────────────────────────────────────────
      animation: {
        "fade-in":      "fadeIn 0.6s ease-out forwards",
        "fade-in-slow": "fadeIn 1s ease-out forwards",
        "slide-up":     "slideUp 0.5s ease-out forwards",
        "slide-in-r":   "slideInRight 0.4s ease-out forwards",
        shimmer:        "shimmer 2.5s linear infinite",
        float:          "float 5s ease-in-out infinite",
        "spin-slow":    "spin 8s linear infinite",
        "pulse-soft":   "pulseSoft 3s ease-in-out infinite",
      },

      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%":   { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":      { transform: "translateY(-10px)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.7" },
        },
      },

      // ─── Background Images ──────────────────────────────────
      backgroundImage: {
        "gradient-luxe": "linear-gradient(135deg, #c49d52 0%, #8b5e34 100%)",
        "gradient-warm": "linear-gradient(180deg, #fbf6ee 0%, #f0e8d8 100%)",
        "gradient-card": "linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(230,215,195,0.5) 100%)",
      },
    },
  },
  plugins: [],
};

export default config;

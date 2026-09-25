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
        background: "#FFF7F8",
        foreground: "#2B1425",
        cream:      "#FFF9FA",
        sand:       "#F7D8DE",
        champagne:  "#F4C2C2",
        gold:       "#B64D7D",
        bronze:     "#7B2D5E",
        ink:        "#2B1425",
        card:       "#FFFCFD",
        border:     "#E8B6C4",
        muted:      "#755B68",
        rose:       "#B64D7D",
      },

      // ─── Typography ─────────────────────────────────────────
      fontFamily: {
        serif: ["var(--font-display)", "Garamond", "Georgia", "serif"],
        sans:  ["var(--font-body)", "system-ui", "sans-serif"],
      },

      // ─── Shadows ────────────────────────────────────────────
      boxShadow: {
        luxe:  "0 20px 70px rgba(43, 20, 37, 0.10)",
        card:  "0 4px 24px rgba(43, 20, 37, 0.07)",
        glow:  "0 0 48px rgba(182, 77, 125, 0.28)",
        inner: "inset 0 2px 8px rgba(43, 20, 37, 0.06)",
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
        "gradient-luxe": "linear-gradient(135deg, #7B2D5E 0%, #B64D7D 100%)",
        "gradient-warm": "linear-gradient(180deg, #FFF9FA 0%, #F7D8DE 100%)",
        "gradient-card": "linear-gradient(135deg, rgba(255,252,253,0.95) 0%, rgba(247,216,222,0.55) 100%)",
      },
    },
  },
  plugins: [],
};

export default config;

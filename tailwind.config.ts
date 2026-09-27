import type { Config } from "tailwindcss";

const themeColor = (token: string) => `rgb(var(${token}) / <alpha-value>)`;

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
        background: themeColor("--theme-background"),
        foreground: themeColor("--theme-foreground"),
        cream:      themeColor("--theme-surface"),
        sand:       themeColor("--theme-elevated"),
        champagne:  themeColor("--theme-highlight"),
        gold:       themeColor("--theme-accent"),
        bronze:     themeColor("--theme-primary"),
        ink:        themeColor("--theme-foreground"),
        card:       themeColor("--theme-card"),
        border:     themeColor("--theme-border"),
        muted:      themeColor("--theme-muted"),
        rose:       themeColor("--theme-accent"),
        success:    themeColor("--theme-success"),
        warning:    themeColor("--theme-warning"),
        danger:     themeColor("--theme-danger"),
      },

      // ─── Typography ─────────────────────────────────────────
      fontFamily: {
        serif: ["var(--font-display)", "Garamond", "Georgia", "serif"],
        sans:  ["var(--font-body)", "system-ui", "sans-serif"],
      },

      // ─── Shadows ────────────────────────────────────────────
      boxShadow: {
        luxe:  "0 20px 70px rgb(var(--theme-shadow) / 0.10)",
        card:  "0 4px 24px rgb(var(--theme-shadow) / 0.07)",
        glow:  "0 0 48px rgb(var(--theme-accent) / 0.28)",
        inner: "inset 0 2px 8px rgb(var(--theme-shadow) / 0.06)",
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
        "gradient-luxe": "linear-gradient(135deg, rgb(var(--theme-primary)) 0%, rgb(var(--theme-accent)) 100%)",
        "gradient-warm": "linear-gradient(180deg, rgb(var(--theme-surface)) 0%, rgb(var(--theme-elevated)) 100%)",
        "gradient-card": "linear-gradient(135deg, rgb(var(--theme-card) / 0.95) 0%, rgb(var(--theme-elevated) / 0.55) 100%)",
      },
    },
  },
  plugins: [],
};

export default config;

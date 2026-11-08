import type { Config } from "tailwindcss";

const token = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink:   token("--ink"),
        paper: token("--paper"),
        stone: token("--stone"),
        brass: token("--brass"),
        text:  token("--text"),
        muted: "rgb(var(--text) / 0.6)",

        // Admin compatibility aliases mapped strictly onto the 5 tokens
        background: token("--paper"),
        foreground: token("--text"),
        cream:      token("--paper"),
        sand:       token("--stone"),
        card:       token("--paper"),
        bronze:     token("--brass"),
        champagne:  token("--stone"),
        rose:       token("--brass"),
        gold:       token("--brass"),
        border:     "rgb(var(--text) / 0.14)"
      },
      fontFamily: {
        serif: ["var(--font-display)", "Bodoni MT", "Didot", "Georgia", "serif"],
        sans:  ["var(--font-body)", "system-ui", "sans-serif"]
      },
      boxShadow: {
        DEFAULT: "none",
        sm:      "none",
        md:      "none",
        lg:      "none",
        xl:      "none",
        "2xl":   "none",
        luxe:    "none",
        card:    "none",
        glow:    "none",
        inner:   "none"
      },
      borderRadius: {
        none:    "0px",
        DEFAULT: "2px",
        sm:      "2px"
      },
      height: {
        nav: "56px"
      },
      keyframes: {
        heroReveal: {
          "0%":   { clipPath: "inset(0 0 100% 0)" },
          "100%": { clipPath: "inset(0 0 0 0)" }
        }
      },
      animation: {
        "hero-reveal": "heroReveal 600ms cubic-bezier(0.22, 1, 0.36, 1) 1 forwards"
      }
    }
  },
  plugins: []
};

export default config;

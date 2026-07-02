import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      // Tighter gutter on phones, roomy on larger screens.
      padding: {
        DEFAULT: "1rem",
        sm: "2rem",
      },
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // next/font exposes each face via a CSS variable; literal names act as
        // a fallback if the variable isn't present (e.g. font still loading).
        display: ["var(--font-display)", '"Bricolage Grotesque"', "sans-serif"],
        sans: ["var(--font-sans)", "Inter", "sans-serif"],
        hand: ["var(--font-hand)", "Kalam", "cursive"],
      },
      colors: {
        // Brand design tokens (chalkboard → whiteboard identity).
        chalkboard: "#1C2A24",
        "chalk-dust": "#9FB3AB",
        "chalk-yellow": "#F0DFA0",
        paper: "#FAF7F0",
        ink: "#2C3E50",
        "ink-muted": "#5C6F7E",
        marker: "#E8745C",

        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "caption-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "caption-in": "caption-in 180ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;

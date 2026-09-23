import type { Config } from "tailwindcss";

// Every color resolves to a CSS variable defined in app/globals.css.
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary)",
        default: "var(--color-default)",
        muted: "var(--color-muted)",
        page: "var(--background-primary)",
        panel: "var(--background-secondary)",
        header: "var(--background-header)",
        raised: "var(--color-secondary-light)",
        "input-border": "var(--border-color-input)",
        neutral: "var(--color-neutral)",
        danger: "var(--color-danger)",
        online: "var(--color-online)",
      },
      borderColor: {
        DEFAULT: "var(--border-color-default)",
      },
      fontFamily: {
        sans: [
          "NotoColorEmojiLimited",
          "var(--font-roboto)",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
        ],
      },
    },
  },
  plugins: [],
};

export default config;

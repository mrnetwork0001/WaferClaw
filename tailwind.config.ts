import type { Config } from "tailwindcss";

// "Fab instrument" palette: warm carbon, bone ink, one hot accent, one pass/fail pair.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        wc: {
          bg: "#0A0908",
          panel: "#100F0D",
          card: "#171512",
          border: "#2A2722",
          "border-hi": "#4A443C",
          hot: "#FF5A1F",
          bone: "#ECE5D5",
          fg: "#ECE5D5",
          "fg-2": "#A39B8B",
          "fg-3": "#6B6458",
          ok: "#C6F26D",
          bad: "#FF4133",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Impact", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;

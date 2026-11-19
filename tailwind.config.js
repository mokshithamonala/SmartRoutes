/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        primary: {
          DEFAULT: "#1d4ed8",
          hover: "#1e40af",
        },
        secondary: "#475569",
      },
      spacing: {
        section: "2rem",
        container: "1rem",
        "form-field": "0.875rem",
      },
      borderRadius: {
        container: "0.75rem",
      },
    },
  },
  plugins: [],
};

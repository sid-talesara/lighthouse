/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Cartographer's instrument palette — deep midnight navy canvas,
        // brass/amber beacon accent, cool teal secondary.
        abyss: {
          900: "#070b12", // deepest canvas
          800: "#0a1019",
          700: "#0e1622",
          600: "#13202f",
          500: "#1a2b3d",
        },
        slate2: {
          400: "#5b6b80",
          300: "#7c8da5",
          200: "#a6b6cc",
          100: "#d4dde9",
        },
        beacon: {
          // warm brass / lighthouse light — the signal color
          600: "#d9913f",
          500: "#e7a44e",
          400: "#f2b968",
          300: "#f8cd8c",
        },
        tide: {
          // cool teal — secondary / structural
          600: "#2f6f6b",
          500: "#3e8f89",
          400: "#5bb0a9",
        },
      },
      fontFamily: {
        display: ['"Fraunces"', "Georgia", "serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      keyframes: {
        beaconPulse: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(242,185,104,0.0)" },
          "50%": {
            boxShadow:
              "0 0 0 5px rgba(242,185,104,0.10), 0 0 26px 2px rgba(242,185,104,0.32)",
          },
        },
        riseIn: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        beaconPulse: "beaconPulse 2.4s ease-in-out infinite",
        riseIn: "riseIn 0.4s ease-out both",
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class", // toggle with class="dark" on <html>
  theme: {
    extend: {
      colors: {
        // ── PostHog-inspired Palette (Lighthouse identity) ───────────
        ph: {
          // Surfaces
          canvas: "#EEEFE9", // PostHog tan — light app bg
          "canvas-dark": "#151515", // near-black for dark mode
          surface: "#FFFFFF", // card face (light)
          "surface-soft": "#E5E7E0", // subtle areas (light)
          "surface-doc": "#FCFCFA", // reading panel (light)
          "surface-dark": "#23251D", // card face (dark — olive charcoal)
          "surface-dark-soft": "#2C2C2C",

          // Borders
          border: "#BFC1B7",
          "border-soft": "#DCDFD2",
          "border-dashed": "#D0D1C9",
          "border-dark": "#4B4B4B",

          // Text
          ink: "#151515", // headlines
          "ink-dark": "#EEEFE9",
          body: "#4D4F46",
          "body-dark": "#C4C5BC",
          mute: "#6C6E63",
          "mute-dark": "#8A8B82",
          ash: "#9B9C92",
          stone: "#B6B7AF",

          // Accents
          yellow: "#F7A501", // primary CTA
          "yellow-pressed": "#DD9001",
          "yellow-dark": "#F1A82C", // CTA in dark mode
          "red-brand": "#F54E00", // brand red (NOT for errors)
          red: "#CD4239", // semantic error red
          "red-soft": "#F7D6D3",
          blue: "#2C84E0",
          "blue-soft": "#DCEAF6",
          "blue-link": "#1D4ED8",
          "blue-teal": "#1078A3",
          green: "#2C8C66",
          "green-soft": "#D9EDDF",
          purple: "#7C44A6",
          "purple-soft": "#E7D8EE",

          // Code block
          "code-bg": "#23251D",

          // Node type accents
          "node-component": "#2C84E0",
          "node-hook": "#7C44A6",
          "node-context": "#2C8C66",
          "node-util": "#DC9300",
          "node-type": "#6C6E63",
          "node-page": "#F54E00",
          "node-api": "#1078A3",
          "node-test": "#CD4239",
        },
      },
      fontFamily: {
        display: ['"Nunito"', "system-ui", "sans-serif"],
        sans: ['"Nunito"', "system-ui", "sans-serif"],
        body: ["system-ui", "-apple-system", '"Segoe UI"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        ph: "6px", // PostHog standard radius
        "ph-sm": "4px",
        "ph-pill": "9999px",
      },
      fontSize: {
        "display-xl": ["2.25rem", { lineHeight: "1.5", fontWeight: "700" }],
        "display-lg": ["1.5rem", { lineHeight: "1.33", fontWeight: "800", letterSpacing: "-0.025em" }],
        "heading-lg": ["1.3125rem", { lineHeight: "1.4", fontWeight: "700" }],
        "heading-md": ["1.125rem", { lineHeight: "1.4", fontWeight: "700" }],
        "heading-sm": ["0.875rem", { lineHeight: "1.4", fontWeight: "600", letterSpacing: "0.01em" }],
        "body-md": ["1rem", { lineHeight: "1.5", fontWeight: "400" }],
        "body-sm": ["0.875rem", { lineHeight: "1.43", fontWeight: "400" }],
        label: ["0.75rem", { lineHeight: "1.3", fontWeight: "600", letterSpacing: "0.04em" }],
        code: ["0.8125rem", { lineHeight: "1.43", fontWeight: "400" }],
      },
      keyframes: {
        nodeEntrance: {
          from: { opacity: "0", transform: "scale(0.92) translateY(4px)" },
          to: { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        dashdraw: {
          to: { strokeDashoffset: "-9" },
        },
        panelIn: {
          from: { opacity: "0", transform: "translateX(12px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        btnPress: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(1px)" },
        },
      },
      animation: {
        "node-entrance": "nodeEntrance 200ms ease-out both",
        "panel-in": "panelIn 200ms ease-out both",
        "fade-in": "fadeIn 150ms ease-out both",
        "btn-press": "btnPress 80ms ease-out",
        dashdraw: "dashdraw 0.6s linear infinite",
      },
      boxShadow: {
        "ph-focus": "0 0 0 3px rgba(44,132,224,0.2)",
        "ph-focus-yellow": "0 0 0 3px rgba(247,165,1,0.2)",
        "ph-edge-glow": "drop-shadow(0 0 4px rgba(44,132,224,0.5))",
        "ph-float": "0 4px 16px rgba(21,21,21,0.12)",
      },
    },
  },
  plugins: [],
};

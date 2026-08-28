/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Matches the admin dashboard's brand tokens for visual consistency across
        // TMV's own apps -- see TMV-Chat-bot/dashboard/web's theme.
        brand: "#1B75BC",
        "brand-dark": "#155A94"
      }
    }
  },
  plugins: []
};

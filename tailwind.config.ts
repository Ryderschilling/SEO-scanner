import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      screens: {
        // Custom breakpoint that gates the floating right-side TOC.
        // 1200px = enough room for 680px content centered + ~200px TOC + gutter.
        toc: "1200px",
      },
    },
  },
  plugins: [],
};
export default config;

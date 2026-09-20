/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        poke: {
          red: '#E3350D',
          yellow: '#FFCB05',
          blue: '#2A75BB',
          dark: '#1C1C1C',
        },
      },
    },
  },
  plugins: [],
};

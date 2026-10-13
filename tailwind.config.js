/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        dex: '#E23B2E',
        'dex-deep': '#B8261C',
        lens: '#3AA0FF',
        ink: '#1B2340',
        sleeve: '#EAF0F7',
        pika: '#FFCB05',
      },
      fontFamily: {
        display: ['"Bowlby One"', 'Nunito', 'system-ui', 'sans-serif'],
        sans: ['Nunito', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

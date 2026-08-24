/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#EEEDFB',
          100: '#DEDCF7',
          200: '#C2BEF3',
          300: '#A5A0F0',
          400: '#7C74E3',
          500: '#5D52D6',
          600: '#4338CA',
          700: '#372EA6',
          800: '#2C2582',
          900: '#22205E',
          950: '#16143D',
        },
        sand: '#E3B778',
        paper: '#F6F5F1',
        ink: '#15161C',
      },
      fontFamily: {
        sans: ['Manrope Variable', 'Manrope', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}', './src/renderer/index.html'],
  theme: {
    extend: {
      fontFamily: {
        cinzel: ['"Cinzel"', '"Segoe UI Variable Text"', '"Segoe UI"', 'serif'],
        spartan: ['"League Spartan"', '"Segoe UI"', 'system-ui', 'sans-serif']
      },
      colors: {
        surface: {
          dark: '#151820',
          'dark-elevated': '#1e2230',
          light: '#f5f5f7',
          'light-elevated': '#ffffff'
        },
        accent: {
          DEFAULT: '#6b7ff0',
          muted: '#4a5abf'
        }
      },
      borderRadius: {
        hud: '22px',
        'hud-mid': '28px',
        'hud-full': '30px'
      }
    }
  },
  plugins: []
}

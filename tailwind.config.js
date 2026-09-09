/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      boxShadow: {
        panel: '0 16px 38px rgba(30, 24, 58, 0.08)',
      },
      colors: {
        brand: {
          50: '#f7f2ff',
          100: '#eadcff',
          200: '#d7baff',
          300: '#be8cff',
          500: '#7a3fe0',
          600: '#6d32c8',
          700: '#57239f',
        },
        tmf: {
          50: '#fff3f1',
          100: '#ffd9d3',
          500: '#ef4b3f',
          600: '#d83a31',
          700: '#b72e27',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      backgroundImage: {
        'hero-grid':
          'linear-gradient(180deg, #ffffff 0%, #fbf9ff 100%)',
      },
    },
  },
  plugins: [],
};

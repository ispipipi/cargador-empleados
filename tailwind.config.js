/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      boxShadow: {
        panel: '0 24px 60px rgba(15, 23, 42, 0.18)',
      },
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#2563eb',
          600: '#1d4ed8',
          700: '#1e40af',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      backgroundImage: {
        'hero-grid':
          'radial-gradient(circle at top left, rgba(37, 99, 235, 0.22), transparent 36%), radial-gradient(circle at top right, rgba(14, 165, 233, 0.18), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.88), rgba(248,250,252,0.96))',
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono:    ['JetBrains Mono', 'ui-monospace', 'monospace'],
        display: ['Sora', 'system-ui', 'sans-serif'],
      },
      colors: {
        // DarkTrade surface hierarchy
        surface: {
          0: '#0a0a0c',
          1: '#0c0c0f',
          2: '#131316',
          3: '#1a1a1f',
        },
        // Accent (teal)
        accent: {
          DEFAULT: '#2dd4bf',
          hover:   '#5eead4',
          muted:   'rgba(45,212,191,0.08)',
          glow:    'rgba(45,212,191,0.12)',
        },
      },
      animation: {
        'fade-up': 'fade-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
    },
  },
  plugins: [],
}

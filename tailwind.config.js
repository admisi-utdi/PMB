/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#1E2A44',
        'navy-light': '#253352',
        accent: '#F5B041',
        'accent-hover': '#e09a2f',
        muted: '#64748b',
        border: '#E8EDF5',
      },
      fontFamily: {
        sans: ['var(--font-poppins)', 'Poppins', 'sans-serif'],
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        popIn: {
          from: { opacity: '0', transform: 'scale(0.85)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        blink: 'blink 2s infinite',
        fadeIn: 'fadeIn .35s ease',
        popIn: 'popIn .4s ease',
      },
    },
  },
  plugins: [],
};

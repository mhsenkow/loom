/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        void: '#050505',
        slate: '#0a0f14',
        phosphor: {
          DEFAULT: '#33ff00',
          dim: '#1a8000',
          glow: '#33ff0050',
        },
        terminal: {
          gray: '#3a3a3a',
          muted: '#666666',
          border: '#2a2a2a',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glow': '0 0 10px #33ff00, 0 0 20px #33ff0050',
        'glow-sm': '0 0 5px #33ff00',
        'block': '4px 4px 0 #33ff00',
        'block-sm': '2px 2px 0 #33ff00',
      },
      borderRadius: {
        'none': '0px',
      },
      animation: {
        'flicker': 'flicker 0.15s ease-in-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'blink': 'blink 1s step-end infinite',
      },
      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 5px #33ff00' },
          '50%': { boxShadow: '0 0 15px #33ff00, 0 0 25px #33ff0050' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}

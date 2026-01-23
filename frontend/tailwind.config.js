/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        void: 'var(--theme-void, #050505)',
        slate: 'var(--theme-slate, #0a0f14)',
        phosphor: {
          DEFAULT: 'var(--theme-phosphor, #33ff00)',
          dim: 'var(--theme-phosphor-dim, #1a8000)',
          glow: 'var(--theme-phosphor-glow, #33ff0050)',
        },
        terminal: {
          gray: 'var(--theme-terminal-gray, #3a3a3a)',
          muted: 'var(--theme-terminal-muted, #666666)',
          border: 'var(--theme-terminal-border, #2a2a2a)',
        }
      },
      fontFamily: {
        mono: ['var(--theme-font, "JetBrains Mono")', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glow': '0 0 10px var(--theme-phosphor, #33ff00), 0 0 20px var(--theme-phosphor-glow, #33ff0050)',
        'glow-sm': '0 0 5px var(--theme-phosphor, #33ff00)',
        'block': '4px 4px 0 var(--theme-phosphor, #33ff00)',
        'block-sm': '2px 2px 0 var(--theme-phosphor, #33ff00)',
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
          '0%, 100%': { boxShadow: '0 0 5px var(--theme-phosphor, #33ff00)' },
          '50%': { boxShadow: '0 0 15px var(--theme-phosphor, #33ff00), 0 0 25px var(--theme-phosphor-glow, #33ff0050)' },
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

import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic tokens via CSS variables
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        'surface-elevated': 'var(--color-surface-elevated)',
        'surface-soft': 'var(--color-surface-soft)',
        'surface-tint': 'var(--color-surface-tint)',
        border: 'var(--color-border)',
        'border-subtle': 'var(--color-border-subtle)',
        primary: 'var(--color-primary)',
        'primary-hover': 'var(--color-primary-hover)',
        'primary-soft': 'var(--color-primary-soft)',
        'primary-text': 'var(--color-primary-text)',
        accent: 'var(--color-accent)',
        'on-surface': 'var(--color-on-surface)',
        'on-surface-variant': 'var(--color-on-surface-variant)',
        'on-surface-muted': 'var(--color-on-surface-muted)',
        success: 'var(--color-success)',
        'success-soft': 'var(--color-success-soft)',
        warning: 'var(--color-warning)',
        'warning-soft': 'var(--color-warning-soft)',
        danger: 'var(--color-danger)',
        'danger-soft': 'var(--color-danger-soft)',
        overlay: 'var(--color-overlay)',
        // Static brand colors for special use
        navy: '#0f172a',
        emerald: {
          400: '#34d399',
          500: '#10b981',
          600: '#059669'
        },
        lime: {
          400: '#a3e635',
          500: '#84cc16'
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'monospace']
      },
      borderRadius: {
        '4xl': '2rem'
      },
      boxShadow: {
        'soft': '0 4px 16px rgba(0,0,0,0.06)',
        'card': '0 1px 4px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 24px rgba(0,0,0,0.10)',
        'glow-emerald': '0 8px 32px rgba(16,185,129,0.22)',
        'drawer': '0 25px 50px rgba(0,0,0,0.25)',
        'dialog': '0 25px 50px rgba(0,0,0,0.35)'
      },
      keyframes: {
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' }
        },
        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' }
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' }
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' }
        },
        'skeleton-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' }
        }
      },
      animation: {
        'slide-in-right': 'slide-in-right 0.25s cubic-bezier(0.25,0.46,0.45,0.94)',
        'slide-in-left': 'slide-in-left 0.25s cubic-bezier(0.25,0.46,0.45,0.94)',
        'fade-in': 'fade-in 0.2s ease-out',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.25,0.46,0.45,0.94)',
        'skeleton': 'skeleton-pulse 1.5s ease-in-out infinite'
      }
    }
  },
  plugins: []
};

export default config;

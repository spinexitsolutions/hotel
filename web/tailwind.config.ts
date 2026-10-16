import type { Config } from 'tailwindcss';

/** Colours, fonts and radii resolve to CSS variables set at runtime from the published theme. */
const c = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: c('primary'),
        'primary-contrast': c('primary-contrast'),
        ink: c('secondary'),
        canvas: c('background'),
        surface: c('surface'),
        fg: c('text'),
        muted: c('muted'),
        line: c('border'),
      },
      fontFamily: {
        display: ['var(--font-heading)', 'Georgia', 'serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      borderRadius: { theme: 'var(--radius)', 'theme-lg': 'calc(var(--radius) * 1.6)' },
      spacing: { section: 'calc(6rem * var(--space))', 'section-sm': 'calc(4rem * var(--space))' },
      letterSpacing: { luxe: '0.22em' },
      transitionTimingFunction: { luxe: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      keyframes: { kenburns: { from: { transform: 'scale(1.0)' }, to: { transform: 'scale(1.08)' } } },
      animation: { kenburns: 'kenburns 12s ease-out forwards' },
    },
  },
  plugins: [],
} satisfies Config;

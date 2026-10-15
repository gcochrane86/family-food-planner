import type { Config } from 'tailwindcss';

const v = (name: string) => `var(--${name})`;
const names = ['bg', 'surface', 'surface-2', 'ink', 'muted', 'line', 'accent', 'accent-ink', 'accent-soft',
  'yolk', 'yolk-soft', 'teal', 'teal-soft', 'evening', 'evening-soft', 'warn', 'warn-soft', 'lcd', 'lcd-ink'];

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: Object.fromEntries(names.map((n) => [n, v(n)])),
      fontFamily: { display: v('font-display'), body: v('font-body'), mono: v('font-mono') },
    },
  },
} satisfies Config;

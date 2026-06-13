/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx,js,jsx}'],
  // The app ships its own design system + CSS reset in styles/globals.css.
  // Disabling preflight keeps Tailwind from re-resetting / overriding it; we
  // only want Tailwind's *utility* classes (flex, grid, spacing, text sizes,
  // arbitrary values, etc.), which large parts of the UI already rely on.
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      // Map the design-system CSS variables onto Tailwind color tokens so
      // utilities like `text-primary` / `bg-card` / `border-strong` resolve to
      // the same values the custom classes use (and follow the active theme).
      colors: {
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
        accent: 'var(--accent)',
        warn: 'var(--warn)',
        danger: 'var(--danger)',
        info: 'var(--info)',
        base: 'var(--bg-base)',
        surface: 'var(--bg-surface)',
        card: 'var(--bg-card)',
        elevated: 'var(--bg-elevated)',
      },
      borderColor: {
        DEFAULT: 'var(--border)',
        strong: 'var(--border-strong)',
      },
    },
  },
  plugins: [],
};

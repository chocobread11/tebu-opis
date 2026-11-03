const token = (name: string) => `var(--${name})`
export default {
  content: ['./components/**/*.vue', './pages/**/*.vue', './app.vue'],
  theme: { extend: {
    colors: {
      border: token('border'), input: token('input'), ring: token('ring'),
      background: token('background'), foreground: token('foreground'),
      primary: { DEFAULT: token('primary'), foreground: token('primary-foreground') },
      secondary: { DEFAULT: token('secondary'), foreground: token('secondary-foreground') },
      muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
      accent: { DEFAULT: token('accent'), foreground: token('accent-foreground') },
      destructive: token('destructive'),
    },
    fontFamily: { sans: ['Inter Variable', 'sans-serif'] },
    borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
  } },
}

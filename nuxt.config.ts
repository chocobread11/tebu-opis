export default defineNuxtConfig({
  compatibilityDate: '2025-10-01',
  modules: ['@nuxtjs/tailwindcss'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  runtimeConfig: {
    databaseUrl: '',
    adminKey: '',
    uploadDir: './data/uploads',
    public: { demo: true, duitnowQr: '', merchantName: 'Tebu Drop' },
  },
  app: { head: {
    title: 'Tebu Drop — Your pantry, freshly stocked.',
    meta: [{ name: 'description', content: 'Cold-pressed sugarcane juice. Order your bottle and pick up from the Level 7 pantry freezer.' }, { name: 'theme-color', content: '#f8f9f3' }, { name: 'referrer', content: 'no-referrer' }],
    link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
  } },
  nitro: { prerender: { routes: process.env.npm_lifecycle_event === 'generate' ? ['/', '/drop', '/admin'] : [] } },
  typescript: { strict: true },
})

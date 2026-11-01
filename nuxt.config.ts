export default defineNuxtConfig({
  compatibilityDate: '2025-10-01',
  buildDir: process.env.NUXT_BUILD_DIR || '.nuxt',
  modules: ['@nuxtjs/tailwindcss'],
  components: [{ path: '~/components', extensions: ['vue'] }],
  css: ['~/assets/css/main.css', '~/assets/css/interface.css'],
  devtools: { enabled: false },
  runtimeConfig: {
    databaseUrl: '',
    adminKey: '',
    uploadDir: './data/uploads',
    public: { demo: false, duitnowQr: '', merchantName: 'Tebu Drop' },
  },
  app: { head: {
    htmlAttrs: { lang: 'en-MY' },
    title: 'Tebu Drop — Your pantry, freshly stocked.',
    meta: [{ name: 'description', content: 'Cold-pressed sugarcane juice. Order your bottle and pick up from the Level 7 pantry freezer.' }, { name: 'theme-color', content: '#f8f9f3' }, { name: 'referrer', content: 'no-referrer' }],
    link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
  } },
  nitro: { prerender: { routes: process.env.npm_lifecycle_event === 'generate' ? ['/', '/drop', '/admin', '/admin/calendar', '/admin/log'] : [] } },
  typescript: { strict: true },
})

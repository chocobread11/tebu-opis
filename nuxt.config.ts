import { resolve } from 'node:path'

const productionBuild = process.argv.includes('build') || process.env.npm_lifecycle_event === 'build'
const buildDir = process.env.NUXT_BUILD_DIR || (productionBuild ? '.nuxt-build' : '.nuxt')

export default defineNuxtConfig({
  // Retain the existing app layout while using the supported Nuxt 4 runtime.
  srcDir: '.',
  compatibilityDate: '2025-10-01',
  buildDir,
  // Reload the embedded model metadata when Prisma regenerates during development.
  watch: [resolve('generated/prisma/internal/class.ts')],
  modules: ['@nuxtjs/tailwindcss'],
  components: [{ path: '~/components', extensions: ['vue'] }],
  css: ['~/assets/css/main.css', '~/assets/css/interface.css'],
  devtools: { enabled: false },
  routeRules: { '/receipt': { headers: { 'Cache-Control': 'private, no-store' } }, '/receipt/**': { headers: { 'Cache-Control': 'private, no-store' } } },
  vite: {
    // Concurrent live/demo dev servers must not overwrite one another's optimized Vue modules.
    cacheDir: resolve(buildDir, 'cache/vite'),
    resolve: { dedupe: ['vue', '@vue/runtime-core', '@vue/runtime-dom', '@vue/reactivity'] },
    optimizeDeps: { include: ['reka-ui', 'vaul-vue', '@hugeicons/vue'] },
  },
  runtimeConfig: {
    deploymentMode: 'development',
    trustProxy: false,
    databaseUrl: '',
    siteUrl: '',
    adminKey: '',
    telegram: { botToken: '', chatId: '' },
    uploadDir: './data/uploads',
    uploadStorage: 'local',
    r2: { accountId: '', endpoint: '', accessKeyId: '', secretAccessKey: '', bucket: '', prefix: 'tebu/media' },
    public: { demo: false, testingCalendar: false, duitnowQr: '/qr/duitnow.jpeg', merchantName: 'Tebu Drop', supportWhatsapp: '' },
  },
  app: { head: {
    htmlAttrs: { lang: 'en-MY' },
    title: 'Tebu Drop — Your pantry, freshly stocked.',
    meta: [{ name: 'description', content: 'Cold-pressed sugarcane juice. Order your bottle and pick up from the Level 7 pantry freezer.' }, { name: 'theme-color', content: '#ffffff' }, { name: 'referrer', content: 'no-referrer' }],
    link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
  } },
  nitro: { prerender: { routes: process.env.npm_lifecycle_event === 'generate' ? ['/', '/drop', '/admin', '/admin/calendar', '/admin/log'] : [] } },
  typescript: { strict: true },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'Qelvi',
        short_name: 'Qelvi',
        description: 'Calorie tracker for Indian food',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/dashboard',
        scope: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
        shortcuts: [
          {
            name: 'AI Meal Logging',
            short_name: 'AI Log',
            description: 'Type your meal in plain English or Hindi for instant calorie estimate',
            url: '/log?mode=ai',
            icons: [{ src: '/icons/shortcut-ai.png', sizes: '96x96' }],
          },
          {
            name: 'Log Breakfast',
            short_name: 'Breakfast',
            url: '/log?meal=breakfast',
            icons: [{ src: '/icons/shortcut-breakfast.png', sizes: '96x96' }],
          },
          {
            name: 'Log Lunch',
            short_name: 'Lunch',
            url: '/log?meal=lunch',
            icons: [{ src: '/icons/shortcut-lunch.png', sizes: '96x96' }],
          },
          {
            name: 'Log Dinner',
            short_name: 'Dinner',
            url: '/log?meal=dinner',
            icons: [{ src: '/icons/shortcut-dinner.png', sizes: '96x96' }],
          },
          {
            name: 'Log Snack',
            short_name: 'Snack',
            url: '/log?meal=snack',
            icons: [{ src: '/icons/shortcut-snack.png', sizes: '96x96' }],
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
})

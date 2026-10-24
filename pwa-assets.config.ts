import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { sizes: [512], padding: 0.1, resizeOptions: { background: '#1e40af' } },
    apple: { sizes: [180], padding: 0.1, resizeOptions: { background: '#1e40af' } },
  },
  images: ['public/icon.svg'],
})

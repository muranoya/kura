import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['./src/__tests__/**/*.test.{ts,tsx}'],
    css: false,
    reporters: ['verbose'],
    onConsoleLog(log: string) {
      if (process.env.VERBOSE) return
      if (/\[kura:|\[SW\]|\[VaultS3Client\]/.test(log)) {
        return false
      }
    },
  },
})

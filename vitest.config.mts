import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost:3000' } },
    setupFiles: ['./test/setup.ts'],
    // Playwright specs live in e2e/ and run with `npm run test:e2e`.
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
})

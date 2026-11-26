import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Served from https://emberreach.morris-heap.com/ (Cloudflare Worker custom domain, VTTER-60)
export default defineConfig({
  base: '/',
  plugins: [react()],
  // The 3D dice tray (three.js + cannon-es, VTTER-79) is one lazy chunk loaded only on the Dice tray tab.
  build: { chunkSizeWarningLimit: 700 },
  // Rules data lives in ../data (shared with the rulebook)
  server: { fs: { allow: ['..'] } },
  test: {
    // Two projects so only component tests pay for a DOM: the pure-logic tests
    // keep running in Node, which is much faster. (Vitest 5 replaced
    // environmentMatchGlobs with projects.)
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: {
          name: 'component',
          include: ['src/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['src/test-setup.ts'],
        },
      },
    ],
  },
})

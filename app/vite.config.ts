import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Served from https://emberreach.morris-heap.com/ (Cloudflare Worker custom domain, VTTER-60)
export default defineConfig({
  base: '/',
  plugins: [react()],
  // Rules data lives in ../data (shared with the rulebook)
  server: { fs: { allow: ['..'] } },
  test: { include: ['src/**/*.test.ts'] },
})

import { defineConfig } from 'vite'
import { existsSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const workDir = resolve(root, 'work')
const work = existsSync(workDir) ? readdirSync(workDir).filter((f) => f.endsWith('.html')) : []

export default defineConfig(({ command }) => ({
  // GitHub Pages project site. dev keeps '/' so the shot tool and local links stay simple.
  base: command === 'build' ? '/portfolio/' : '/',
  build: {
    target: 'es2022',
    assetsInlineLimit: 2048,
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        ...Object.fromEntries(work.map((f) => [f.replace(/\.html$/, ''), resolve(workDir, f)])),
      },
    },
  },
}))

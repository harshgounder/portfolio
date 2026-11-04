// regression test (review 2026-10-11 #2, slice-1 #7): resizing while the map beat or the fog insets are on screen
// must not break their textures / render targets
import puppeteer from 'puppeteer-core'
import { createServer } from 'vite'
const server = await createServer({ root: new URL('..', import.meta.url).pathname, logLevel: 'error', server: { port: 0 } }); await server.listen()
const b = await puppeteer.launch({ executablePath: '/usr/bin/brave', headless: true, args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'],
  env: { ...process.env, __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }, defaultViewport: { width: 1280, height: 800 } })
const p = await b.newPage(); const msgs = []
p.on('console', (m) => { const t = m.text(); if (/GL_|WebGL|INVALID|texSubImage/i.test(t)) msgs.push(t.slice(0, 160)) })
await p.goto(`${server.resolvedUrls.local[0]}?scene=story`); await p.waitForFunction(() => window.__lab?.ready && window.__story, { timeout: 30000 })
// map beat (its canvas texture) and fog beat at 0.66 (both insets visible: their own render targets, review #7)
const go = (id, k) => p.evaluate((id, k) => { const m = window.__story.update().beats.find((x) => x.id === id); scrollTo(0, m.top + (m.height - innerHeight) * k) }, id, k)
const wait = () => new Promise((r) => setTimeout(r, 1500))
const insetsShown = () => p.evaluate(() => [...document.querySelectorAll('[data-beat=fog] .inset')].filter((e) => getComputedStyle(e).visibility === 'visible').length)
let shown = 0
for (const [w, h] of [[1500, 950], [900, 700], [1280, 800]]) {
  await go('map', 0.1); await wait(); await go('fog', 0.66); await wait(); if ((await insetsShown()) === 2) shown++
  await p.setViewport({ width: w, height: h }); await wait()
}
await go('fog', 0.66); await wait(); await go('map', 0.1); await wait()
const ok = msgs.length === 0 && shown === 3
console.log(`${ok ? 'PASS' : 'FAIL'} no WebGL errors after resizes on the map and fog beats (${msgs.length} errors, insets seen ${shown}/3) ${msgs.slice(0, 2).join(' | ')}`)
await b.close(); await server.close()
process.exit(ok ? 0 : 1)

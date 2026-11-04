// behaviour test for the quality tiers (look/tiers.js, main.js, story setQuality), headless Brave at device dpr 2
// slow frames step quality down (pixel ratio, MSAA, refraction, insets), fast frames raise it once, a fixed ?dpr turns
// the controller off, ?tier=N fixes a tier; no WebGL errors through the changes. frame times are fed synchronously
// inside one evaluate, so the live loop's own frames cannot interleave with them.
import puppeteer from 'puppeteer-core'
import { createServer } from 'vite'
const root = new URL('..', import.meta.url).pathname
const server = await createServer({ root, logLevel: 'error', server: { port: 0 } })
await server.listen()
const browser = await puppeteer.launch({ executablePath: '/usr/bin/brave', headless: true, args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'],
  env: { ...process.env, __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' },
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`) }
const open = async (q) => {
  const page = await browser.newPage(); const msgs = []
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /GL_|INVALID/.test(t)) msgs.push(t.slice(0, 160)) })
  page.on('pageerror', (e) => msgs.push(e.message))
  await page.goto(`${server.resolvedUrls.local[0]}?scene=story${q}`)
  await page.waitForFunction(() => window.__lab?.ready && window.__story, { timeout: 30000 })
  return { page, msgs }
}
const state = (page) => page.evaluate(() => ({ tier: window.__lab.tiers?.tier ?? null, dpr: window.__lab.renderer?.getPixelRatio?.() ?? null }))
const feed = (page, ms, n) => page.evaluate((ms, n) => { for (let i = 0; i < n; i++) window.__lab.tiers.update(ms) }, ms, n)
// one tier change: feed frames until the tier moves (a window is 90 frames and may already hold a few real frames),
// at most 2 windows; returns how many frames it took
const step = (page, ms) => page.evaluate((ms) => { const t = window.__lab.tiers, t0 = t.tier; let i = 0
  while (t.tier === t0 && i < 180) { t.update(ms); i++ } return i }, ms)

let { page, msgs } = await open('')
let s = await state(page)
check('auto: starts at the top tier with the device pixel ratio', s.tier === 3 && s.dpr === 2, JSON.stringify(s))
// first drop: <= 30 warm-up frames + one 90-frame window; later drops: a fresh window (~18 real frames land in it
// during the 300 ms pause, so 50-90 of ours)
let n = await step(page, 30); await sleep(300); s = await state(page)
check('slow frames (30 ms) -> one tier down: dpr 1.5', s.tier === 2 && s.dpr === 1.5 && n <= 120, `${JSON.stringify(s)} after ${n} frames`)
n = await step(page, 30); await sleep(300); s = await state(page)
check('still slow -> medium: dpr 1 (a fresh window after each change)', s.tier === 1 && s.dpr === 1 && n >= 50 && n <= 90, `${JSON.stringify(s)} after ${n} frames`)
n = await step(page, 30); await sleep(300); s = await state(page)
check('still slow -> low: dpr 0.75', s.tier === 0 && s.dpr === 0.75, `${JSON.stringify(s)} after ${n} frames`)
await feed(page, 30, 400); s = await state(page)
check('no tier below low', s.tier === 0, JSON.stringify(s))
// low tier: insets off on the fog beat (they would rise at 0.66), the frame still draws
const fog = await page.evaluate(() => window.__story.update().beats.find((b) => b.id === 'fog'))
await page.evaluate((f) => scrollTo(0, f.top + (f.height - innerHeight) * 0.66), fog); await sleep(1500)
const shown = await page.evaluate(() => [...document.querySelectorAll('[data-beat=fog] .inset')].filter((e) => getComputedStyle(e).visibility === 'visible').length)
check('low tier: insets are not drawn', shown === 0, `(${shown} visible)`)
const drawn = await page.evaluate(async () => { const img = new Image(); img.src = window.__lab.capture(); await img.decode(); return img.width })
check('low tier: frame still renders at the lower resolution', drawn === Math.round(1280 * 0.75), `(canvas ${drawn} px wide)`)
n = await step(page, 5); await sleep(300); s = await state(page)
check('fast frames (5 ms) -> one tier up', s.tier === 1, `${JSON.stringify(s)} after ${n} frames`)
await feed(page, 5, 400); await sleep(300); s = await state(page)
check('raises at most once (no flapping)', s.tier === 1, JSON.stringify(s))
check('no WebGL errors through the tier changes', msgs.length === 0, msgs.slice(0, 2).join(' | '))
await page.close()
;({ page, msgs } = await open('&dpr=2')); s = await state(page)
check('explicit ?dpr turns the controller off', s.tier === null && s.dpr === 2, JSON.stringify(s)); await page.close()
;({ page, msgs } = await open('&tier=1')); s = await state(page)
check('?tier=1 fixes the medium tier', s.tier === 1 && s.dpr === 1, JSON.stringify(s)); await page.close()
await browser.close(); await server.close()
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)

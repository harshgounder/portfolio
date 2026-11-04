// M1: walk a scroll-driven WebGL site with wheel events and log what happens per step (reference only)
// usage: node tools/capture.mjs URL OUTDIR [steps=160] [delta=120] [wait_ms=350]
// writes OUTDIR/step-NNN.jpg every 4 steps and OUTDIR/log.jsonl (step, ms, scroll state, visible DOM text)
import puppeteer from 'puppeteer-core'
import { writeFileSync, appendFileSync } from 'node:fs'
const [url, out, steps = 160, delta = 120, wait = 350] = process.argv.slice(2)
// XDISPLAY=:99 -> a real (headed) Brave inside an Xvfb display: the site's age gate never appears in headless,
// and moving a headed window on the user's Hyprland desktop moved their own terminal twice (logs/LOG.md).
// so: never touch the user's desktop; Wayland is cut from the env so Brave can only see the Xvfb display.
const xdisplay = process.env.XDISPLAY
const { WAYLAND_DISPLAY, ...baseEnv } = process.env
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/brave', headless: !xdisplay,
  args: ['--no-first-run', '--autoplay-policy=no-user-gesture-required',
    ...(xdisplay ? ['--ozone-platform=x11', '--window-size=1440,900', '--window-position=0,0'] : []),
    // Xvfb has no GL; XGL=sw uses SwiftShader, anything else asks ANGLE for EGL on the NVIDIA GPU (PRIME env)
    ...(process.env.XGL === 'sw' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=gl-egl', '--ignore-gpu-blocklist'])],
  env: { ...(xdisplay ? { ...baseEnv, DISPLAY: xdisplay } : process.env),
    ...(process.env.XGL === 'sw' ? {} : { __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }) },
  defaultViewport: { width: 1440, height: 900 },
})
const page = await browser.newPage()
// headless Brave leaves <audio>-style .ogg loads pending forever, so the site's loader never finishes.
// serve those requests whole from Node instead.
await page.setRequestInterception(true)
page.on('request', async (r) => {
  if (!/\.(ogg|mp3|m4a)(\?|$)/.test(r.url())) return r.continue()
  try {
    const res = await fetch(r.url())
    r.respond({ status: 200, contentType: res.headers.get('content-type') ?? 'audio/ogg', body: Buffer.from(await res.arrayBuffer()) })
  } catch { r.abort() }
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const t0 = Date.now()
writeFileSync(`${out}/log.jsonl`, '')
const log = (o) => appendFileSync(`${out}/log.jsonl`, JSON.stringify({ ms: Date.now() - t0, ...o }) + '\n')

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
// wait for the age gate "Yes" (div.action, CSS-uppercased) to be visible through its whole parent chain
const yes = await page.waitForFunction(() => {
  const el = [...document.querySelectorAll('.action')].find((e) => /^yes$/i.test(e.innerText.trim()))
  if (!el) return null
  let op = 1
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) op *= +getComputedStyle(n).opacity
  const r = el.getBoundingClientRect()
  return op > 0.9 && r.width > 0 ? [r.x + r.width / 2, r.y + r.height / 2] : null
}, { timeout: 120000, polling: 500 }).then((h) => h.jsonValue())
  .catch(async (e) => { await page.screenshot({ path: `${out}/gate-timeout.jpg`, quality: 70 }); throw e })
log({ event: 'gate-ready', yes, gl: await page.evaluate(() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g?.getExtension('WEBGL_debug_renderer_info'); return g ? g.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : g.RENDERER) : 'no webgl2' }) })
await page.screenshot({ path: `${out}/gate.jpg`, quality: 80 })
await page.mouse.click(yes[0], yes[1])
log({ event: 'clicked-yes' })
for (let i = 0; i < 12; i++) { await sleep(500); if (i % 4 === 3) await page.screenshot({ path: `${out}/intro-${i}.jpg`, quality: 80 }) }

// what does the scroll object expose? (Hydra keeps its own scroll, the page height is one screen)
const probe = () => page.evaluate(() => {
  const pick = (o) => o && Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'number').slice(0, 12))
  const s = window.Scroll
  return { scrollY, scroll: pick(s), scrollInst: pick(s?.instance ?? s?._instance ?? s?.main),
    text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 160) }
})
log({ event: 'probe', ...(await probe()) })

await page.mouse.move(720, 450)
for (let i = 1; i <= +steps; i++) {
  await page.mouse.wheel({ deltaY: +delta })
  await sleep(+wait)
  const p = await probe()
  log({ step: i, ...p })
  if (i % 4 === 0) await page.screenshot({ path: `${out}/step-${String(i).padStart(3, '0')}.jpg`, quality: 75 })
}
await browser.close()

// M1 step 1: open a live site in headless Brave on the GPU, screenshot at a few times, dump DOM hints
// usage: node tools/explore.mjs URL OUTDIR
import puppeteer from 'puppeteer-core'
const [url, out] = process.argv.slice(2)
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/brave', headless: true,
  args: ['--no-first-run', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  env: { ...process.env, __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' },
  defaultViewport: { width: 1440, height: 900 },
})
const page = await browser.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
const t0 = Date.now()
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
for (const s of [3, 8, 15]) {
  await new Promise((r) => setTimeout(r, Math.max(0, s * 1000 - (Date.now() - t0))))
  await page.screenshot({ path: `${out}/explore-${s}s.png` })
}
const info = await page.evaluate(() => ({
  url: location.href, title: document.title,
  scroll: [scrollY, document.documentElement.scrollHeight, innerHeight],
  canvases: [...document.querySelectorAll('canvas')].map((c) => [c.width, c.height, c.className]),
  clickables: [...document.querySelectorAll('button, a, [role=button], [class*=button], [class*=btn]')].map((b) => (b.innerText || b.getAttribute('aria-label') || b.className).trim().slice(0, 40)).filter(Boolean).slice(0, 40),
  text: document.body.innerText.slice(0, 600),
  globals: Object.keys(window).filter((k) => /hydra|uil|stage|scroll|world|tween|theatre|player|app/i.test(k)).slice(0, 40),
}))
console.log(JSON.stringify(info, null, 1)); console.log('errors', errs.slice(0, 5))
await browser.close()

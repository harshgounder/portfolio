// one-off: what does the age gate look like in the DOM after loading? (M1 debugging)
import puppeteer from 'puppeteer-core'
const out = process.argv[2]
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/brave', headless: true,
  args: ['--no-first-run', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--disable-blink-features=AutomationControlled'],
  ignoreDefaultArgs: ['--enable-automation'],
  env: { ...process.env, __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' },
  defaultViewport: { width: 1440, height: 900 },
})
const page = await browser.newPage()
await page.setRequestInterception(true)
page.on('request', async (r) => {
  if (!/\.(ogg|mp3|m4a)(\?|$)/.test(r.url())) return r.continue()
  try { const res = await fetch(r.url()); r.respond({ status: 200, contentType: 'audio/ogg', body: Buffer.from(await res.arrayBuffer()) }) } catch { r.abort() }
})
await page.goto('https://santionispirits.com/?gpu=2', { waitUntil: 'domcontentloaded', timeout: 60000 })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const opacity = () => page.evaluate(() => {
  const e = [...document.querySelectorAll('.action')].find((x) => /^yes$/i.test(x.innerText.trim()))
  let op = 1, n = e; while (n && n.nodeType === 1) { op *= +getComputedStyle(n).opacity; n = n.parentElement }
  return +op.toFixed(2)
})
await sleep(25000)
console.log('loaded, yes opacity', await opacity())
console.log('state', JSON.stringify(await page.evaluate(() => ({ vis: document.visibilityState, focus: document.hasFocus(), tier: window.GPU?.TIER ?? window.Tests?.TIER, gl: (() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g?.getExtension('WEBGL_debug_renderer_info'); return g ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'none' })(), text: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 80) }))))
await page.mouse.click(720, 600); await sleep(3000)
console.log('after click on page, yes opacity', await opacity()); await page.screenshot({ path: `${out}/gate-after-click.jpg`, quality: 70 })
await page.keyboard.press('Space'); await sleep(3000)
console.log('after key, yes opacity', await opacity())
await page.mouse.click(512, 450); await sleep(4000)
console.log('after click at YES spot, yes opacity', await opacity()); await page.screenshot({ path: `${out}/gate-after-yes.jpg`, quality: 70 })
console.log(await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200)))
await browser.close()

// one-off (M1): does the app's own state store answer, and can consent be set the way the Yes button does?
import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/brave', headless: true,
  args: ['--no-first-run', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  env: { ...process.env, __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' },
  defaultViewport: { width: 1440, height: 900 },
})
const page = await browser.newPage()
await page.setRequestInterception(true)
page.on('request', async (r) => { if (!/\.(ogg|mp3|m4a)(\?|$)/.test(r.url())) return r.continue(); try { const res = await fetch(r.url()); r.respond({ status: 200, contentType: 'audio/ogg', body: Buffer.from(await res.arrayBuffer()) }) } catch { r.abort() } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await page.goto('https://santionispirits.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
// the gate is drawn in WebGL; its DOM text copy stays at opacity 0 by design, and its app-state key is
// fragment-local. so watch the pixels: wait until the YES box is drawn where the DOM copy says it sits.
const yesRect = () => page.evaluate(() => { const e = [...document.querySelectorAll('.action')].find((x) => /^yes$/i.test(x.innerText.trim())); if (!e) return null; const b = e.getBoundingClientRect(); return b.width > 0 ? { x: b.x, y: b.y, width: b.width, height: b.height } : null })
let drawn = 0
for (let i = 0; i < 120 && drawn < 150; i++) {
  await sleep(1000)
  const clip = await yesRect()
  if (!clip) continue
  const png = await page.screenshot({ clip, encoding: 'base64' })
  drawn = await page.evaluate(async (b64) => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = new OffscreenCanvas(im.width, im.height).getContext('2d'); c.drawImage(im, 0, 0); const d = c.getImageData(0, 0, im.width, im.height).data; let n = 0; for (let k = 0; k < d.length; k += 4) if (d[k] > 200) n++; return n }, png)
}
console.log('YES box bright px', drawn)
await sleep(1500)
const r = await page.evaluate(() => { const b = [...document.querySelectorAll('.action')].find((e) => /^yes$/i.test(e.innerText.trim())).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2] })
await page.mouse.move(r[0] - 120, r[1] + 60); await page.mouse.move(r[0], r[1], { steps: 12 }); await sleep(400)
await page.mouse.down(); await sleep(80); await page.mouse.up()
await sleep(3000)
console.log('after click', JSON.stringify(await page.evaluate(() => ({ consent: AppState.get('AgeGate/ageGateConsent'), visible: AppState.get('AgeGate/visible') }))))
for (let i = 0; i < 15; i++) { await page.mouse.wheel({ deltaY: 300 }); await sleep(300) }
await sleep(1500)
console.log('blocks', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('div,section')].map((e) => { const r = e.getBoundingClientRect(); return { c: (typeof e.className === 'string' ? e.className : '').slice(0, 40), y: Math.round(r.y + Global.SCROLL.y), h: Math.round(r.height) } }).filter((b) => b.h > 1000).slice(0, 40))))
console.log('after scroll', JSON.stringify(await page.evaluate(() => ({ scroll: Object.fromEntries(Object.entries(window.Global?.SCROLL ?? {}).filter(([, v]) => typeof v === 'number')) }))))
await page.screenshot({ path: '../research/m1/frames/state-after-consent.jpg', quality: 70 })
await browser.close()

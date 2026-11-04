// M1: walk a scroll-driven WebGL site in headless Brave and record its scroll grammar (reference only, local only)
// usage: node tools/capture.mjs URL OUTDIR [step_px=150] [frame_every_px=450]
// writes OUTDIR/layout.json (scene blocks: y, height), OUTDIR/inertia.json (scroll position after one wheel tick,
// sampled every frame), OUTDIR/walk.jsonl (scroll y per step) and OUTDIR/y-NNNNN.jpg frames.
// how the gate is passed (logs/LOG.md 2026-10-10): the age gate is drawn in WebGL and its DOM copy stays at
// opacity 0, so we wait until the YES box is drawn (pixels), hover it, then click, like a person would.
import puppeteer from 'puppeteer-core'
import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
const [url, out, stepPx = 150, everyPx = 450] = process.argv.slice(2)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/brave', headless: true,
  args: ['--no-first-run', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  env: { ...process.env, __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' },
  defaultViewport: { width: 1440, height: 900 },
})
const page = await browser.newPage()
// headless leaves the site's .ogg loads pending forever, so serve them whole from Node.
// SAVE_AUDIO=dir also keeps a copy of each file for local analysis (reference only, never shipped)
const saveAudio = process.env.SAVE_AUDIO
await page.setRequestInterception(true)
page.on('request', async (r) => {
  if (!/\.(ogg|mp3|m4a)(\?|$)/.test(r.url())) return r.continue()
  try {
    const res = await fetch(r.url()); const body = Buffer.from(await res.arrayBuffer())
    const type = /\.mp3/.test(r.url()) ? 'audio/mpeg' : 'audio/ogg'
    r.respond({ status: 200, contentType: type, body })
    if (saveAudio) {
      const rel = new URL(r.url()).pathname.replace(/^\/+/, '')
      mkdirSync(dirname(`${saveAudio}/${rel}`), { recursive: true }); writeFileSync(`${saveAudio}/${rel}`, body)
      appendFileSync(`${saveAudio}/urls.txt`, `${Date.now()} ${r.url()}\n`)
    }
  } catch { r.abort() }
})
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })

const yesRect = () => page.evaluate(() => {
  const e = [...document.querySelectorAll('.action')].find((x) => /^yes$/i.test(x.innerText.trim()))
  const b = e?.getBoundingClientRect()
  return b?.width ? { x: b.x, y: b.y, width: b.width, height: b.height } : null
})
const brightPx = (b64) => page.evaluate(async (s) => {
  const im = new Image(); im.src = 'data:image/png;base64,' + s; await im.decode()
  const c = new OffscreenCanvas(im.width, im.height).getContext('2d'); c.drawImage(im, 0, 0)
  const d = c.getImageData(0, 0, im.width, im.height).data; let n = 0
  for (let k = 0; k < d.length; k += 4) if (d[k] > 200) n++
  return n
}, b64)
// pass the gate: wait for the drawn YES box, hover, click; prove it worked by scrolling once (retry up to 4x)
let passed = false
for (let attempt = 1; attempt <= 4 && !passed; attempt++) {
  let drawn = 0, clip
  for (let i = 0; i < 150 && drawn < 300; i++) {
    await sleep(1000)
    if ((clip = await yesRect())) drawn = await brightPx(await page.screenshot({ clip, encoding: 'base64' }))
  }
  await sleep(2000)                                    // let the buttons finish sliding in
  clip = await yesRect()
  const [cx, cy] = [clip.x + clip.width / 2, clip.y + clip.height / 2]
  await page.mouse.move(cx - 120, cy + 60); await page.mouse.move(cx, cy, { steps: 12 }); await sleep(500)
  await page.mouse.down(); await sleep(100); await page.mouse.up()
  await sleep(4000)
  await page.mouse.move(720, 450)
  await page.mouse.wheel({ deltaY: 300 }); await sleep(1500)
  const y = await page.evaluate(() => Global.SCROLL.y)
  console.log(`gate attempt ${attempt}: yes-box bright px ${drawn}, scroll after test wheel ${y}`)
  await page.screenshot({ path: `${out}/gate-attempt-${attempt}.jpg`, quality: 60 })
  passed = y > 0
}
if (!passed) throw new Error('could not pass the age gate')
await page.mouse.wheel({ deltaY: -2000 }); await sleep(2500)  // back to the top
const scrollY = () => page.evaluate(() => Global.SCROLL.y)
// 1) layout: every scene's UI block, in scroll coordinates
const layout = await page.evaluate(() => [...document.querySelectorAll('.Story > *, [class$="UI"]')]
  .map((e) => { const r = e.getBoundingClientRect(); return { block: (e.className || '').toString().split(' ')[0], y: Math.round(r.y + Global.SCROLL.y), h: Math.round(r.height) } })
  .filter((b) => b.h > 0).sort((a, b) => a.y - b.y))
writeFileSync(`${out}/layout.json`, JSON.stringify({ viewport: [1440, 900], storyHeight: await page.evaluate(() => document.querySelector('.Story')?.getBoundingClientRect().height), blocks: layout }, null, 1))

// 2) inertia: one wheel tick of 100, then sample the scroll every animation frame for 2 s
await sleep(1000)
const inertia = await page.evaluate(async () => {
  const s = [], t0 = performance.now(), y0 = Global.SCROLL.y
  window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }))
  document.querySelector('canvas')?.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }))
  while (performance.now() - t0 < 2000) { await new Promise((r) => requestAnimationFrame(r)); s.push([Math.round(performance.now() - t0), +(Global.SCROLL.y - y0).toFixed(2)]) }
  return s
})
writeFileSync(`${out}/inertia.json`, JSON.stringify(inertia))

// 3) walk the whole story
writeFileSync(`${out}/walk.jsonl`, '')
const end = layout.reduce((m, b) => Math.max(m, b.y + b.h), 0)
let next = 0
for (let i = 0; i < 400; i++) {
  await page.mouse.wheel({ deltaY: +stepPx })
  await sleep(250)
  const y = await scrollY()
  appendFileSync(`${out}/walk.jsonl`, JSON.stringify({ i, y }) + '\n')
  if (y >= next) { await sleep(500); await page.screenshot({ path: `${out}/y-${String(Math.round(y)).padStart(5, '0')}.jpg`, quality: 72 }); next = y + +everyPx }
  if (y >= end - 900) break
}
await browser.close()

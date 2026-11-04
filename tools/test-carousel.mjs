// behaviour test for look/carousel.js on the story's inks beat (headless Brave)
// rules: inert off its beat, buttons + arrow keys + swipe change the ink, the live line announces it, wrap goes the
// short way round, only the chosen ink shows its colour (regime b: one accent), a choice plays the clink.
import puppeteer from 'puppeteer-core'
import { createServer } from 'vite'
const root = new URL('..', import.meta.url).pathname
const server = await createServer({ root, logLevel: 'error', server: { port: 0 } })
await server.listen()
const browser = await puppeteer.launch({ executablePath: '/usr/bin/brave', headless: true, args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'],
  env: { ...process.env, __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' },
  defaultViewport: { width: 1280, height: 800 } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`) }
const page = await browser.newPage()
const errors = []; page.on('pageerror', (e) => errors.push(e.message))
await page.goto(`${server.resolvedUrls.local[0]}?scene=story`)
await page.waitForFunction(() => window.__lab?.ready && window.__story && window.__carousel, { timeout: 30000 })
// count plays of the clink without needing a running audio context
await page.evaluate(() => { const a = window.__audio, play = a.play; window.__clinks = 0; a.play = (n, o) => { if (n === 'clink') window.__clinks++; return play(n, o) } })
const st = () => page.evaluate(() => ({ index: window.__carousel.index, pos: window.__carousel.pos, live: document.querySelector('.ink-car [aria-live]').textContent,
  inert: document.querySelector('.ink-car').inert, clinks: window.__clinks }))
check('carousel inert while its beat is off screen', (await st()).inert === true)
const beat = await page.evaluate(() => { const b = window.__story.update().beats.find((x) => x.id === 'inks'); return { top: b.top, h: b.height } })
await page.evaluate((y) => scrollTo(0, y), beat.top + (beat.h - 800) * 0.5); await sleep(1500)
let s = await st()
check('active on its beat, first ink shown', s.inert === false && s.index === 0 && /Ink 1 of 3: Vermilion/.test(s.live), `(${s.live})`)
await page.click('.ink-car .car-next'); await sleep(200); s = await st()
check('next button -> ink 2, announced', s.index === 1 && /Ink 2 of 3: Indigo/.test(s.live), `(${s.live})`)
check('a choice plays the clink', s.clinks === 1, `(${s.clinks})`)
await page.focus('.ink-car'); await page.keyboard.press('ArrowLeft'); await sleep(200); s = await st()
check('arrow key on the focused carousel -> back to ink 1', s.index === 0, `(${s.index})`)
// swipe left across the bottles (not on a button): next
const box = await page.evaluate(() => { const r = document.querySelector('.ink-car .car-title').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
await page.mouse.move(box.x + 60, box.y); await page.mouse.down(); await page.mouse.move(box.x - 80, box.y, { steps: 6 }); await page.mouse.up(); await sleep(200)
s = await st()
check('swipe left -> next ink', s.index === 1, `(${s.index})`)
// the colour rule, measured on the canvas: wait for the row to settle on Indigo, count blue vs red pixels in the middle
await sleep(2200)
const colour = async () => page.evaluate(async () => {
  const png = window.__lab.capture(), img = new Image(); img.src = png; await img.decode()
  const c = new OffscreenCanvas(img.width, img.height).getContext('2d'); c.drawImage(img, 0, 0)
  const d = c.getImageData(img.width * 0.4, img.height * 0.25, img.width * 0.2, img.height * 0.5).data
  let blue = 0, red = 0
  for (let i = 0; i < d.length; i += 4) { const [r, g, b] = [d[i], d[i + 1], d[i + 2]]; if (b - r > 40 && b > 90) blue++; if (r - b > 60 && r > 120) red++ }
  return { blue, red }
})
let c = await colour()
check('chosen ink shows its colour, the previous one does not (middle bottle)', c.blue > 300 && c.red < 30, `(blue ${c.blue}, red ${c.red})`)
// wrap: settle on ink 1, then step back -> ink 3. the short way is one step (pos jumps to 3 and eases down to 2);
// the long way would sweep across ink 2 (pos falling from 0 toward 2 through 1)
await page.click('.ink-car .car-prev'); await sleep(2500)                // index 0, settled
await page.click('.ink-car .car-prev'); await sleep(80)
s = await st()
check('wrap: prev from ink 1 -> ink 3, the row takes the short way', s.index === 2 && s.pos > 2 && s.pos <= 3, `(index ${s.index}, pos ${s.pos.toFixed(2)})`)
// refraction: the same frame with and without the bend pass (fixed boil: capture() renders at t = 0); the bottle area
// must change, the ground far from the bottles must not
const frameWith = (on) => page.evaluate(async (on) => {
  window.__lab.world.setQuality({ samples: 4, refraction: on, insets: true })
  const img = new Image(); img.src = window.__lab.capture(); await img.decode()
  const c = new OffscreenCanvas(img.width, img.height).getContext('2d'); c.drawImage(img, 0, 0)
  return Array.from(c.getImageData(0, 0, img.width, img.height).data.filter((_, i) => i % 4 === 1))
}, on)
await sleep(2500)
const on = await frameWith(true), off = await frameWith(false); await frameWith(true)
const diff = (x0, y0, x1, y1) => { let n = 0, t = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { t++; if (Math.abs(on[y * 1280 + x] - off[y * 1280 + x]) > 60) n++ } return (100 * n) / t }
const inB = diff(512, 200, 768, 600), far = diff(60, 560, 150, 700)   // far = empty lower-left ground (x 60-200 overlapped the left bottle)
check('refraction bends the ground inside the bottle, nowhere else', inB > 0.5 && far === 0, `(inside ${inB.toFixed(2)}%, far ${far.toFixed(3)}%)`)
// a cancelled touch (the browser takes over a vertical scroll: pointercancel) must not leave a swipe armed: a later
// tap elsewhere on the page that lands > 50 px sideways changed the ink (review of 7e5f3d4). and no input while inert
const i0 = (await st()).index
await page.evaluate(() => {
  const el = document.querySelector('.ink-car .car-title'), r = el.getBoundingClientRect()
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 10, clientY: r.top + 5, pointerId: 7 }))
  el.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 7 }))
  document.body.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.left + 300, clientY: r.top + 5, pointerId: 8 }))
})
await sleep(100)
check('a cancelled touch leaves no swipe armed (a tap elsewhere does not change the ink)', (await st()).index === i0, `(${i0} -> ${(await st()).index})`)
check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close(); await server.close()
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)

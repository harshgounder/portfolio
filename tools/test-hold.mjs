// behaviour test for interaction/hold.js on the story's map beat (headless Brave)
// rules: 3 s linear fill while held, 1 s linear drain on release, scroll locked while holding, works only while
// the beat is pinned, keyboard hold (Space) on a real button, stays complete, progressbar for screen readers.
// shots: shots/hold-0.png, hold-50.png, hold-100.png
import puppeteer from 'puppeteer-core'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'
const root = new URL('..', import.meta.url).pathname
mkdirSync(`${root}shots`, { recursive: true })   // git-ignored: absent on a fresh clone (found by a fresh-clone run)
const server = await createServer({ root, logLevel: 'error', server: { port: 0 } })
await server.listen()
const browser = await puppeteer.launch({ executablePath: '/usr/bin/brave', headless: true, args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'],
  env: { ...process.env, __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' },
  defaultViewport: { width: 1280, height: 800 } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`) }
const page = await browser.newPage()
await page.goto(`${server.resolvedUrls.local[0]}?scene=story`)
await page.waitForFunction(() => window.__lab?.ready && window.__story, { timeout: 30000 })
const st = () => page.evaluate(() => {
  const b = document.querySelector('.hold-btn'), bar = document.querySelector('.hold [role=progressbar]')
  const map = window.__story.update().beats.find((x) => x.hold)
  return { hidden: b.hidden, label: b.textContent, now: +bar.getAttribute('aria-valuenow'), y: scrollY, offset: map.offset, top: map.top,
    shown: document.querySelectorAll('.caption.after.shown').length }
})
const shot = (name) => page.screenshot({ path: `${root}shots/${name}.png` })

let s = await st()
check('hold button hidden away from its beat', s.hidden)
// scroll the map beat into its pinned range
await page.evaluate((y) => scrollTo(0, y + innerHeight * 0.4), s.top); await sleep(1500)
s = await st()
check('hold button shown while its beat is pinned', !s.hidden && s.offset === 0, `(offset ${s.offset})`)
await shot('hold-0')
// mouse hold for 1.5 s -> about 50%
await page.mouse.move(640, 420); await page.mouse.down()
const yBefore = (await st()).y
await page.mouse.wheel({ deltaY: 600 }); await sleep(1500)
s = await st()
check('scroll locked while holding', Math.abs(s.y - yBefore) < 2, `(y ${yBefore} -> ${s.y})`)
check('fill is linear over 3 s (1.5 s held -> 40-60%)', s.now >= 40 && s.now <= 60, `(${s.now}%)`)
await shot('hold-50')
await page.mouse.up(); await sleep(600)
s = await st()
check('release drains (1 s for a full drain: 0.6 s after 50% -> 0-10%)', s.now <= 10, `(${s.now}%)`)
// Space held, focus leaves the button (no scroll), Space released elsewhere: the hold must end (review #8).
// (pressing Tab here would scroll the next element into view, the beat would leave, and that alone ends the
// hold, so it could not tell the old bug apart; this blurs in place instead)
await page.focus('.hold-btn'); await page.keyboard.down(' '); await sleep(400)
await page.evaluate(() => document.activeElement.blur()); await page.keyboard.up(' '); await sleep(1200)
s = await st()
check('hold ends when Space is released after focus left the button (no ghost hold)', s.now <= 10, `(${s.now}%)`)
// keyboard hold: focus the button, hold Space 3.3 s
await page.focus('.hold-btn'); await page.keyboard.down(' '); await sleep(3300); await page.keyboard.up(' ')
await sleep(200); s = await st()
check('keyboard hold (Space) completes', s.now === 100 && s.label === 'The map is finished', `(${s.now}%, "${s.label}")`)
check('second caption revealed on completion', s.shown === 1)
const f = await page.evaluate(() => ({ cls: document.activeElement?.className, dis: document.activeElement?.getAttribute('aria-disabled') }))
check('focus stays on the finished button (aria-disabled, not disabled)', f.cls === 'hold-btn' && f.dis === 'true', `(${f.cls}, aria-disabled=${f.dis})`)
await sleep(1500); s = await st()
check('stays complete after release', s.now === 100)
await shot('hold-100')
await page.mouse.wheel({ deltaY: 300 }); await sleep(800)
check('scroll works again after completion', (await st()).y > s.y)

await browser.close(); await server.close()
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)

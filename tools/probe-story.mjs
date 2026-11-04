// test the story module's scroll smoothing (story/story.js) against the Santioni measurement: the shown position
// closes 0.5 of the remaining distance per 60 fps frame, at ANY frame rate, and prefers-reduced-motion turns it off.
// v2 (review #15): v1 only printed numbers and always exited 0. now the frames are driven with synthetic timestamps
// (update(now)) inside one synchronous evaluate, so 30/60/120/144 Hz are exact and no real frame can interleave.
// usage: node tools/probe-story.mjs   (exit 1 on any failure)
import puppeteer from 'puppeteer-core'
import { createServer } from 'vite'
const server = await createServer({ root: new URL('..', import.meta.url).pathname, logLevel: 'error', server: { port: 0 } })
await server.listen()
const browser = await puppeteer.launch({ executablePath: '/usr/bin/brave', headless: true, args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'],
  env: { ...process.env, __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' },
  defaultViewport: { width: 1280, height: 800 } })
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`) }
for (const reduce of [false, true]) {
  const page = await browser.newPage()
  if (reduce) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await page.goto(`${server.resolvedUrls.local[0]}?scene=story`)
  await page.waitForFunction(() => window.__lab?.ready && window.__story, { timeout: 30000 })
  // per rate: settle, jump 400 px, then step ~100 ms of frames
  const runs = await page.evaluate(() => {
    const out = {}
    for (const hz of [30, 60, 120, 144]) {
      let t = performance.now() + 1e6 * (1 + hz)               // far from the live loop's clock, own timeline
      scrollTo(0, 2000); for (let i = 0; i < 400; i++) __story.update((t += 1000 / 60))  // settle at 2000
      const y0 = __story.y; scrollTo(0, 2400); const target = scrollY
      const steps = []; const n = Math.round(hz * 0.1)
      for (let i = 0; i < n; i++) steps.push(__story.update((t += 1000 / hz)).y)
      // an OLDER timestamp must not move the shown position away from the target
      const before = __story.y, back = __story.update(t - 5).y
      out[hz] = { y0, target, remaining: (target - steps.at(-1)) / (target - y0), want: 0.5 ** ((n / hz) * 60), monotonic: steps.every((y, i) => i === 0 || y >= steps[i - 1]), first: steps[0], backOk: back >= before && back <= target }
    }
    return out
  })
  if (!reduce) {
    // want = 0.5 per 60 fps frame of the time actually stepped (144 Hz: 14 frames = 97.2 ms -> 0.5^5.83)
    for (const [hz, r] of Object.entries(runs)) check(`${hz} Hz: remaining = 0.5 per 1/60 s of elapsed time (${r.want.toFixed(5)})`, Math.abs(r.remaining - r.want) < 1e-4 && r.monotonic, `(${r.remaining.toFixed(5)}, monotonic ${r.monotonic})`)
    for (const [hz, r] of Object.entries(runs)) check(`${hz} Hz: an older timestamp does not push the position away`, r.backOk)
  } else {
    for (const [hz, r] of Object.entries(runs)) check(`reduced motion ${hz} Hz: no smoothing (first frame at the target)`, r.first === r.target, `(${r.first} vs ${r.target})`)
  }
  await page.close()
}
await browser.close(); await server.close()
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)

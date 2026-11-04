// behaviour test for audio/audio.js + audio/storysound.js inside the story scene (headless Brave)
// checks the rules in art/SOUND-BIBLE.md 2: nothing before a gesture, toggle first in tab order and remembered,
// beds follow the beats, the gate's yes is the gesture (a denied visitor hears nothing), footsteps from the walk,
// and records 4 s of what a listener hears to measure it (out: shots/sound-<beat>.webm)
import puppeteer from 'puppeteer-core'
import { createServer } from 'vite'
import { writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const root = new URL('..', import.meta.url).pathname
const server = await createServer({ root, logLevel: 'error', server: { port: 0 } })
await server.listen()
// the real autoplay rule (headless defaults let audio start without any user activation, which hid review #4)
const browser = await puppeteer.launch({ executablePath: '/usr/bin/brave', headless: true, args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist', '--autoplay-policy=document-user-activation-required'],
  env: { ...process.env, __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' },
  defaultViewport: { width: 1280, height: 800 } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`) }
async function open(q = '') {
  const page = await browser.newPage()
  await page.goto(`${server.resolvedUrls.local[0]}?scene=story${q}`)
  await page.waitForFunction(() => window.__lab?.ready && window.__audio, { timeout: 30000 })
  return page
}
const dbg = (p) => p.evaluate(() => ({ ...window.__audio.debug(), pressed: document.querySelector('.sound-toggle').getAttribute('aria-pressed') }))
const gain = (d, name) => Object.fromEntries(d.loops)[name] ?? -1
const ready = (p) => p.waitForFunction(() => window.__audio.ready, { timeout: 20000 }).then(() => true, () => false)
// scroll to the middle of a beat's pinned range (beat positions come from the story, not hard-coded px)
const goBeat = (p, id) => p.evaluate((id) => { const b = window.__story.update().beats.find((x) => x.id === id); scrollTo(0, b.top + Math.max(0, b.height - innerHeight) * 0.3) }, id)

// 1. no gate: locked until a gesture, toggle first in tab order
let p = await open()
let d = await dbg(p)
check('locked before any gesture (no AudioContext)', d.state === 'locked' && d.pressed === 'false', `(state=${d.state})`)
await p.keyboard.press('Tab')
const first = await p.evaluate(() => document.activeElement?.className)
check('sound toggle is first in tab order', first === 'sound-toggle', `(first=${first})`)
await p.keyboard.press('Enter')                                   // keyboard gesture turns sound on
check('toggle by keyboard unlocks + loads all sounds', await ready(p))
d = await dbg(p)
const manifest = await p.evaluate(async () => (await (await fetch('/audio/manifest.json')).json()).sounds)
const nLoops = Object.values(manifest).filter((s) => s.loop).length
check('every file decoded, every loop running', d.state === 'running' && d.buffers === Object.keys(manifest).length && d.loops.length === nLoops, `(buffers ${d.buffers}/${Object.keys(manifest).length}, loops ${d.loops.length}/${nLoops})`)
check('toggle says on', d.pressed === 'true')

// 2a. every beat's bed mix from the files' measured loudness and the beat's gains (uncorrelated loops add in
// power): deterministic, unlike a short recording of a melodic loop (+-3 LU by window; review 2026-10-11)
const mixes = await p.evaluate(async () => {
  const man = (await (await fetch('/audio/manifest.json')).json()).sounds
  return window.__story.update().beats.map((b) => {
    const at = (k) => Object.entries(b.sound ?? {}).filter(([n]) => man[n]?.loop).map(([n, g]) => [n, typeof g === 'function' ? g(k) : g])
    const lufs = (k) => { const pw = at(k).reduce((s, [n, g]) => s + g * g * 10 ** (man[n].lufs / 10), 0); return pw > 0 ? 10 * Math.log10(pw) : -99 }
    return [b.id, Math.max(lufs(0), lufs(0.5), lufs(1)).toFixed(1)]
  })
})
check('every beat bed mix (loudest point) inside -27..-21 LUFS', mixes.every(([, l]) => l >= -27 && l <= -21), `(${mixes.map((m) => m.join(' ')).join(', ')})`)

// 2. beds follow beats
await goBeat(p, 'fog'); await sleep(2500); d = await dbg(p)
check('fog beat: fog-air + wind up, motif silent', gain(d, 'fog-air') > 0.3 && gain(d, 'wind') > 0.3 && gain(d, 'motif') < 0.05, `(fog-air ${gain(d, 'fog-air')}, wind ${gain(d, 'wind')}, motif ${gain(d, 'motif')})`)
// footsteps: count step plays while the walk runs (only when the local walk bake exists)
await p.evaluate(() => { window.__steps = 0; const play = window.__audio.play; window.__audio.play = (n, o) => { if (n === 'step') window.__steps++; return play(n, o) }; return true })
// the fog walk is scrubbed by the scroll: still reader = no steps; scrolling the beat's pinned range from 15% to
// 85% walks 0.7 x 3.2 m = 2.24 m = 1.55 strides = about 3 steps (2 per stride)
await sleep(1500)
const stillSteps = await p.evaluate(() => window.__steps)
const fogB = await p.evaluate(() => { const b = window.__story.update().beats.find((x) => x.id === 'fog'); return { top: b.top, run: b.height - innerHeight } })
for (let i = 0; i <= 60; i++) { await p.evaluate((y) => scrollTo(0, y), Math.round(fogB.top + fogB.run * (0.15 + 0.7 * i / 60))); await sleep(50) }
await sleep(800)
const steps = (await p.evaluate(() => window.__steps)) - stillSteps
const isWalk = await p.evaluate(() => window.__world.walking)
check('no footsteps while the reader is still (walk is scroll-driven)', stillSteps === 0, `(steps=${stillSteps})`)
check('footsteps follow the scrolled walk: 2-5 over 70% of the fog beat (stride maths: ~3)', isWalk ? steps >= 2 && steps <= 5 : steps === 0, `(walking=${isWalk}, steps=${steps})`)
await goBeat(p, 'fog'); await sleep(1500)
// record what a listener hears in a beat (4 s), measured later with tools/audio_measure.py
async function record(page, name) {
  const b64 = await page.evaluate(async () => {
    const rec = new MediaRecorder(window.__audio.tap(), { mimeType: 'audio/webm;codecs=opus' }); const parts = []
    rec.ondataavailable = (e) => parts.push(e.data); rec.start()
    await new Promise((r) => setTimeout(r, 4000)); rec.stop(); await new Promise((r) => (rec.onstop = r))
    const buf = new Uint8Array(await new Blob(parts).arrayBuffer()); let s = ''
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    return btoa(s)
  })
  mkdirSync(`${root}shots`, { recursive: true }); const f = `${root}shots/sound-${name}.webm`
  writeFileSync(f, Buffer.from(b64, 'base64'))
  return JSON.parse(execFileSync('python3', ['-I', `${root}../tools/audio_measure.py`, f]).toString())
}
// beds only for the bed-mix numbers: wait until no voice plays (ducking would lower the beds), then mute vo
await p.waitForFunction(() => { const d = window.__audio.debug(); return !d.vo && !d.queue.length }, { timeout: 20000 }).catch(() => {})
await p.evaluate(() => window.__audio.busGain('vo', 0)); await sleep(1500)
let m = await record(p, 'fog')
check('fog beat recording audible, peaks under -1 dBTP', m.lufs_i > -35 && m.true_peak_dbtp <= -1, `(${m.lufs_i} LUFS in a 4 s window, tp ${m.true_peak_dbtp})`)
await goBeat(p, 'red'); await sleep(3500); d = await dbg(p)
check('red beat: motif up, fog-air down', gain(d, 'motif') > 0.5 && gain(d, 'fog-air') < 0.1, `(motif ${gain(d, 'motif')}, fog-air ${gain(d, 'fog-air')})`)
// drawing: pen-scratch follows pointer speed on the red beat
for (let i = 0; i <= 40; i++) { await p.mouse.move(200 + i * 20, 400 + 100 * Math.sin(i / 4)); await sleep(16) }
d = await dbg(p)
check('drawing raises the pen-scratch loop', gain(d, 'pen-scratch') > 0.2, `(pen ${gain(d, 'pen-scratch')})`)
await sleep(1500); d = await dbg(p)
check('pen-scratch falls when the pointer stops', gain(d, 'pen-scratch') < 0.1, `(pen ${gain(d, 'pen-scratch')})`)
m = await record(p, 'red')
check('red beat recording audible, peaks under -1 dBTP', m.lufs_i > -35 && m.true_peak_dbtp <= -1, `(${m.lufs_i} LUFS in a 4 s window, tp ${m.true_peak_dbtp})`)

// 2b. voice-over: waits for the reader, ducks the music, karaoke follows the words
p.evaluate(() => window.__audio.busGain('vo', 1))
await p.close()
p = await open()
await p.evaluate(() => { window.__voLog = []; const u = window.__audio.update; window.__audio.update = (y, dt) => { const r = u(y, dt); if (r) window.__voLog.push([r.id, +r.t.toFixed(2), window.__audio.debug().music]); return r } })
await p.keyboard.press('Tab'); await p.keyboard.press('Enter')
await p.waitForFunction(() => window.__audio.debugBus, { timeout: 5000 })
await p.evaluate(() => { const set = () => { if (window.__audio.debugBus('music') === null) return setTimeout(set, 50); window.__audio.busGain('music', 0.5) }; set() })   // listener's own music volume, set BEFORE any voice (review #6)
// keep scrolling (more than 0.6 px per frame) from the gesture on, through loading and arrival: no voice may start
const t0 = Date.now(); let y = 0
const fogTop = await p.evaluate(() => window.__story.update().beats.find((x) => x.id === 'fog').top)
while (Date.now() - t0 < 4000) { y += 40; await p.evaluate((v) => scrollTo(0, v), fogTop + (y % 600)); await sleep(30) }
check('sounds loaded while scrolling', await ready(p))
let vlog = await p.evaluate(() => window.__voLog.length)
check('no voice while the reader keeps scrolling', vlog === 0, `(${vlog} frames with voice)`)
await goBeat(p, 'fog'); await sleep(3500)
d = await dbg(p)
check('voice starts once the reader rests (fog-1)', d.vo === 'fog-1' || (await p.evaluate(() => window.__voLog.some((v) => v[0] === 'fog-1'))), `(vo=${d.vo})`)
// the duck is read inside the update hook while a clip plays (a snapshot could miss the clip: review #11)
const ducks = await p.evaluate(() => window.__voLog.filter((v) => v[1] > 0.6).map((v) => v[2]))
check('music ducks under the voice (duck gain while a clip plays)', ducks.length > 0 && Math.max(...ducks) < 0.6, `(max ${ducks.length ? Math.max(...ducks) : 'none'} over ${ducks.length} frames)`)
// karaoke sampled for 2 s: at some moment some words are lit and others not (one instant can fall between words)
let karaoke = false
for (let i = 0; i < 20 && !karaoke; i++) {
  const lit = await p.evaluate(() => [...document.querySelectorAll('[data-beat="fog"] .caption .w')].map((w) => +(w.style.getPropertyValue('--k') || 0)))
  karaoke = lit.some((k) => k > 0.5) && lit.some((k) => k < 0.1); await sleep(100)
}
check('karaoke: words light up one at a time (sampled 2 s)', karaoke)
m = await record(p, 'fog-vo')
check('voice sits over the beds (mix with voice >= -21 LUFS)', m.lufs_i >= -21 && m.true_peak_dbtp <= -1, `(${m.lufs_i} LUFS, tp ${m.true_peak_dbtp})`)
await sleep(6000); d = await dbg(p)
const musicVol = await p.evaluate(() => window.__audio.debugBus('music'))
check('the listener music volume survives the VO duck', Math.abs(musicVol - 0.5) < 0.02, `(music bus ${musicVol})`)
await p.evaluate(() => window.__audio.busGain('music', 1))
check('second caption voiced after the first, then music back up', !d.vo && d.music > 0.9 && (await p.evaluate(() => window.__voLog.some((v) => v[0] === 'fog-2'))), `(vo=${d.vo}, music ${d.music})`)

// 2c. touch: one tap must start sound (a touch pointerdown is not a user activation; review #4)
await p.close()
p = await browser.newPage()
await p.emulate({ viewport: { width: 400, height: 800, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile' })
await p.goto(`${server.resolvedUrls.local[0]}?scene=story`); await p.waitForFunction(() => window.__lab?.ready && window.__audio, { timeout: 30000 })
await p.evaluate(() => localStorage.removeItem('kit.sound'))
await p.touchscreen.tap(200, 500); await ready(p); await sleep(500); d = await dbg(p)
check('one tap on a touch screen starts sound and the toggle says on', d.state === 'running' && d.pressed === 'true', `(state=${d.state}, pressed=${d.pressed})`)

// 3. mute is remembered across visits, and a remembered "off" survives the first click
await p.click('.sound-toggle'); d = await dbg(p)
check('toggle mutes', d.pressed === 'false')
await p.close()
p = await open()
await p.mouse.click(640, 400); await sleep(500); d = await dbg(p)
check('remembered off: a click on the page does not start sound', d.state === 'locked', `(state=${d.state})`)
await p.click('.sound-toggle'); await ready(p); d = await dbg(p)
check('toggle turns it back on', d.state === 'running' && d.pressed === 'true')
check('turning it back on is remembered', await p.evaluate(() => localStorage.getItem('kit.sound')) === 'on')
await p.close()

// 4. the age gate's yes is the gesture; while the gate is open every gain stays 0
p = await open('&gate=yesno')
await p.click('[data-answer="no"]'); await sleep(300); d = await dbg(p)
check('gate: No does not start sound', d.state === 'locked')
await p.click('[data-answer="yes"]'); await ready(p); await sleep(2500); d = await dbg(p)
check('gate: Yes starts sound, beds come up (title beat: drone + wind)', d.state === 'running' && gain(d, 'wind') > 0.3 && gain(d, 'drone-low') > 0.2, `(wind ${gain(d, 'wind')}, drone ${gain(d, 'drone-low')})`)
await p.close()

await browser.close(); await server.close()
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)

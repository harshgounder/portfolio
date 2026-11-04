// inset probe (slice-1 review #7 + #6): measures the close-up insets of the fog beat in a frozen frame.
// usage: node tools/inset-probe.mjs [--dpr 1|2] [--at 0.66] [--out shots/insets] [--resize 900x700]
//   --resize: show the insets at 1280x800 first (their targets get made at that size), then resize the viewport and
//   measure there: a target that is not resized with its inset is drawn minified and fails the outline check
//   normal pass:  crops each inset (inside its border) and runs measure.py: hatch spacing/width, grey areas
//   outline pass: the fill is forced to plain paper (no lines, no shadow) so the only ink in an inset is the
//                 outline hull; width = ink area / (ink-to-other edge count / 2), in device px and CSS px
// prints one JSON line per inset per pass, then PASS/FAIL; exit 1 on a page error, a missing inset or a failed check.
// checks (CSS px, so the same at any dpr): outline 2.4-4.0 (the plain canvas view reads ~3 for outline 4.4: an
// inverted hull shows less than its push on curved silhouettes), median hatch spacing 3-7 on insets with >= 20
// measured patches (at least one inset must qualify), grey areas <= 6.
// before the fix (2026-10-11): outline 0.55-1.64, spacing 3 with moire.
import puppeteer from 'puppeteer-core'
import { createServer } from 'vite'
import { parseArgs } from 'node:util'
import { mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const { values: a } = parseArgs({ options: { resize: { type: 'string' }, dpr: { type: 'string', default: '1' }, at: { type: 'string', default: '0.66' }, out: { type: 'string', default: 'shots/insets' } } })
const dpr = +a.dpr
const root = new URL('..', import.meta.url).pathname
const out = `${root}${a.out}`; mkdirSync(out, { recursive: true })
const server = await createServer({ root, logLevel: 'error', server: { port: 0 } })
await server.listen()
const browser = await puppeteer.launch({ executablePath: '/usr/bin/brave', headless: true, args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist', '--hide-scrollbars'],
  env: { ...process.env, __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' },
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: dpr } })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto(`${server.resolvedUrls.local[0]}?scene=story&t=1.5&dpr=${dpr}`)
await page.waitForFunction(() => window.__lab?.ready && window.__story, { timeout: 30000 })
const toFog = async () => {
  const fog = await page.evaluate(() => window.__story.update().beats.find((b) => b.id === 'fog'))
  await page.evaluate((f, k) => scrollTo(0, Math.round(f.top + Math.max(0, f.height - innerHeight) * k)), fog, +a.at)
  await new Promise((r) => setTimeout(r, 1500))
}
await toFog()
if (a.resize) {
  const [w, h] = a.resize.split('x').map(Number)
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr }); await new Promise((r) => setTimeout(r, 1000)); await toFog()
}
const rects = await page.evaluate(() => [...document.querySelectorAll('[data-beat=fog] .inset')]
  .map((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, shown: getComputedStyle(el).visibility === 'visible' } }))
const shots = {}
for (const pass of ['normal', 'outline']) {
  if (pass === 'outline') await page.evaluate(() => Object.assign(window.__lab.params, { shadow: -3, high: -3, bounce: -3, tooth: 0, midWidth: 0 }))
  const png = (await page.evaluate(() => window.__lab.capture())).split(',')[1]
  shots[pass] = `${out}/fog-dpr${dpr}-${pass}.png`; writeFileSync(shots[pass], Buffer.from(png, 'base64'))
}
await browser.close(); await server.close()
if (errors.length) { console.log('page errors:\n' + errors.join('\n')); process.exit(1) }
if (rects.length !== 2 || !rects.every((r) => r.shown)) { console.log('insets not both visible', JSON.stringify(rects)); process.exit(1) }
const py = `
import sys, json, numpy as np
from PIL import Image
sys.path.insert(0, sys.argv[1])
from measure import measure
rects, shots, dpr, out = json.loads(sys.argv[2]), json.loads(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
bad, judged = [], []
m = 12  # CSS px kept clear of the inset's own rough border
for pass_, f in shots.items():
    im = Image.open(f).convert('RGB')
    for i, r in enumerate(rects):
        box = tuple(round(v * dpr) for v in (r['x'] + m, r['y'] + m, r['x'] + r['w'] - m, r['y'] + r['h'] - m))
        c = im.crop(box); p = f'{out}/inset{i}-dpr{int(dpr)}-{pass_}.png'; c.save(p)
        row = {'inset': i, 'pass': pass_, 'dpr': dpr, 'crop_px': [c.width, c.height]}
        if pass_ == 'normal':
            r2 = measure(p); h = r2['hatch']
            row.update(grey_of_marks=r2['grey_of_marks'], spacing_px=h['spacing_px_q25_50_75'], width_px=h['width_px_q25_50_75'],
                       period_px=h['period_px_q25_50_75'], coarse=h['coarse_share'], largest_cross=h['crossing_largest_region'])
            # spacing is only judged on enough measured hatch: the face inset is nearly solid ink and reads 4-16
            # patches (its "spacing" swung 5.5 -> 7.8 between two equal-looking renders); the hand inset reads 33-201
            row['patches'] = h['patches']
            if h['patches'] >= 20:
                judged.append(i); sp = (h['spacing_px_q25_50_75'] or [0, 0, 0])[1] / dpr
                if not 3 <= sp <= 7: bad.append(f'inset {i} spacing {sp:.1f} css px')
            if r2['grey_of_marks'] > 6: bad.append(f'inset {i} grey areas {r2["grey_of_marks"]}')
        else:
            a = np.asarray(c, float); L = a @ np.array([.2126, .7152, .0722]); ink = L < 70
            edges = (ink[:, 1:] != ink[:, :-1]).sum() + (ink[1:, :] != ink[:-1, :]).sum()
            w = float(ink.sum()) / max(1.0, edges / 2)
            row.update(ink_pct=round(100 * float(ink.mean()), 2), outline_device_px=round(w, 2), outline_css_px=round(w / dpr, 2))
            if not 2.4 <= w / dpr <= 4.0: bad.append(f'inset {i} outline {w / dpr:.2f} css px')
        print(json.dumps(row))
# after a resize the insets can be too small for 20 patches; there the outline is what catches a stale target
if not judged and not sys.argv[6]: bad.append('no inset had enough hatch to judge spacing')
print(('PASS insets drawn 1:1 at dpr %g%s (spacing judged on inset %s)' % (dpr, sys.argv[6], judged)) if not bad else 'FAIL ' + '; '.join(bad))
sys.exit(1 if bad else 0)
`
try {
  process.stdout.write(execFileSync('python3', ['-I', '-c', py, `${root}tools`, JSON.stringify(rects), JSON.stringify(shots), String(dpr), out, a.resize ? ` after a resize to ${a.resize}` : '']).toString())
} catch (e) { process.stdout.write(e.stdout?.toString() ?? String(e)); process.exit(1) }

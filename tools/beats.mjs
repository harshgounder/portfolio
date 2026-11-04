// beat contact sheet + liveness check (research/r3/MOTION-REPOS.md take #1)
// usage: node tools/beats.mjs [--at 0.2,0.5,0.8] [--out shots/beats]
// for every story beat: scroll into its pinned range at each `at` fraction, let the smoothing settle, screenshot.
// writes <out>/<beat>-<at>.png, a tiled <out>/sheet.png (rows = beats) and prints, per beat, the share of pixels
// that differ between consecutive frames: a beat whose frames are (almost) identical is "dead" (nothing moves
// while the reader scrolls through it). exit code 1 if any beat is dead.
import puppeteer from 'puppeteer-core'
import { createServer } from 'vite'
import { parseArgs } from 'node:util'
import { mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const { values: a } = parseArgs({ options: { at: { type: 'string', default: '0.2,0.5,0.8' }, out: { type: 'string', default: 'shots/beats' }, dead: { type: 'string', default: '0.5' } } })
const root = new URL('..', import.meta.url).pathname
const at = a.at.split(',').map(Number)
mkdirSync(`${root}${a.out}`, { recursive: true })
const server = await createServer({ root, logLevel: 'error', server: { port: 0 } })
await server.listen()
const browser = await puppeteer.launch({ executablePath: '/usr/bin/brave', headless: true, args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'],
  env: { ...process.env, __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' },
  defaultViewport: { width: 1280, height: 800 } })
const page = await browser.newPage()
await page.goto(`${server.resolvedUrls.local[0]}?scene=story`)
await page.waitForFunction(() => window.__lab?.ready && window.__story, { timeout: 30000 })
const beats = await page.evaluate(() => window.__story.update().beats.map((b) => ({ id: b.id, top: b.top, height: b.height })))
const files = []
for (const b of beats) {
  for (const k of at) {
    await page.evaluate((y) => scrollTo(0, y), Math.round(b.top + Math.max(0, b.height - 800) * k))
    await new Promise((r) => setTimeout(r, 900))
    const f = `${root}${a.out}/${b.id}-${k}.png`
    await page.screenshot({ path: f }); files.push(f)
  }
}
await browser.close(); await server.close()
// tile + liveness in python (numpy/PIL already used by the measure tools)
const py = `
import sys, json, numpy as np
from PIL import Image
beats, at, out, dead = json.loads(sys.argv[1]), json.loads(sys.argv[2]), sys.argv[3], float(sys.argv[4])
W, H = 640, 400
sheet = Image.new('RGB', (W * len(at), H * len(beats)), 'white'); bad = []
for r, b in enumerate(beats):
    ims = [Image.open(f'{out}/{b}-{k}.png').convert('RGB') for k in at]
    for c, im in enumerate(ims): sheet.paste(im.resize((W, H)), (c * W, r * H))
    g = [np.asarray(im.convert('L'), float) for im in ims]
    diffs = [round(100 * float((abs(g[i + 1] - g[i]) > 40).mean()), 2) for i in range(len(g) - 1)]
    live = min(diffs) > dead
    print(f"{'live' if live else 'DEAD'} {b:6} frame-to-frame change % {diffs}")
    if not live: bad.append(b)
sheet.save(f'{out}/sheet.png'); print('sheet', f'{out}/sheet.png'); sys.exit(1 if bad else 0)
`
try {
  process.stdout.write(execFileSync('python3', ['-I', '-c', py, JSON.stringify(beats.map((b) => b.id)), JSON.stringify(at), `${root}${a.out}`, a.dead]).toString())
} catch (e) { process.stdout.write(e.stdout?.toString() ?? String(e)); process.exit(1) }

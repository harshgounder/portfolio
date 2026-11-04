// screenshot a lab scene in headless Brave and fail if the frame is blank
// usage: node tools/shot.mjs [--scene smoke] [--backend webgl|webgpu] [--gpu sw|amd|nvidia] [--t 1.5] [--dpr 1|2] [--preset name] [--page] [--query panel] [--bench 200] [--scroll px] [--draw] [--out name] [--flags "--x --y"] [--allow-fallback]
// exit 1 on a blank frame, a page error, a console error, or a model that was missing and replaced by the fallback
// (unless --allow-fallback): a screenshot of the wrong model must not pass (review #16)
import { parseArgs } from 'node:util'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'vite'
import puppeteer from 'puppeteer-core'

const { values: a } = parseArgs({
  options: {
    scene: { type: 'string', default: 'smoke' },
    backend: { type: 'string', default: 'webgl' },
    gpu: { type: 'string', default: 'sw' }, // sw | amd | nvidia
    t: { type: 'string', default: '1.5' },
    dpr: { type: 'string', default: '1' },
    'allow-fallback': { type: 'boolean', default: false },
    preset: { type: 'string' },
    page: { type: 'boolean', default: false },
    query: { type: 'string', default: '' },
    bench: { type: 'string' }, // frames to benchmark after the shot
    scroll: { type: 'string' },
    draw: { type: 'boolean', default: false }, // sweep the mouse in a loop first (ink trail test) // scroll the page to this y (px) and let the story settle first // extra query flags, e.g. 'panel'
    out: { type: 'string' },
    browser: { type: 'string', default: '/usr/bin/brave' },
    flags: { type: 'string', default: '' }, // extra browser args, space separated
  },
})

// headless GPU recipes, tested 2026-10-10 on this laptop (AMD Vega iGPU + GTX 1650, Brave 154).
// a plain headless launch falls back to SwiftShader; '--use-angle=vulkan' + '--disable-vulkan-surface'
// broke WebGL and gave VK_ERROR_OUT_OF_DEVICE_MEMORY on NVIDIA WebGPU, so ANGLE runs on EGL here.
const common = ['--use-angle=gl-egl', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist']
const recipes = {
  // sw has no WebGPU adapter, so --backend webgpu here tests WebGPURenderer's WebGL2 fallback
  sw: { args: ['--enable-unsafe-swiftshader'] },
  amd: { args: [...common, '--disable-vulkan-surface', '--use-webgpu-power-preference=default-low-power'] },
  nvidia: {
    args: [...common, '--use-webgpu-power-preference=default-high-performance'],
    env: { __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' },
  },
}
const recipe = recipes[a.gpu] ?? recipes.sw

const server = await createServer({ root: new URL('..', import.meta.url).pathname, logLevel: 'error', server: { port: 0 } })
await server.listen()
const url = `${server.resolvedUrls.local[0]}?scene=${a.scene}&backend=${a.backend}&t=${a.t}&dpr=${a.dpr}${a.preset ? `&preset=${a.preset}` : ''}${a.query ? `&${a.query}` : ''}`

// puppeteer gives the browser a fresh temp profile, so the user's Brave profile is never touched
const browser = await puppeteer.launch({
  executablePath: a.browser,
  headless: true,
  args: ['--no-first-run', '--hide-scrollbars', ...recipe.args, ...a.flags.split(' ').filter(Boolean)],
  env: { ...process.env, ...recipe.env },
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: +a.dpr },
})

let code = 1
let problems = []
for (let attempt = 1; attempt <= 2 && code === 1; attempt++) try {   // only a blank frame is retried
  if (attempt > 1) console.log('blank frame, retrying once')
  const page = await browser.newPage()
  const logs = []
  problems = []
  page.on('console', (m) => {
    logs.push(`${m.type()}: ${m.text()}`)
    if (m.type() === 'error') problems.push(`console error: ${m.text()}`)
    if (!a['allow-fallback'] && /model .* missing/.test(m.text())) problems.push(`fallback: ${m.text()}`)
    if (/preset .* not found/.test(m.text())) problems.push(`missing preset: ${m.text()}`)   // never allowed: the shot would not show what was asked
  })
  page.on('pageerror', (e) => { logs.push(`pageerror: ${e.message}`); problems.push(`pageerror: ${e.message}`) })
  await page.goto(url)
  await page.waitForFunction(() => window.__lab?.ready, { timeout: 30_000 })
  if (a.scroll) { await page.evaluate((y) => scrollTo(0, y), +a.scroll); await new Promise((r) => setTimeout(r, 800)) }
  if (a.draw) {
    for (let i = 0; i <= 60; i++) { const k = i / 60; await page.mouse.move(110 + 260 * k, 430 + 170 * Math.sin(k * Math.PI * 2.2)); await new Promise((r) => setTimeout(r, 16)) }
  }
  const lab = await page.evaluate(() => window.__lab)
  const webgpu = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter()
    return adapter ? `${adapter.info.vendor} ${adapter.info.architecture} ${adapter.info.description}`.trim() || 'adapter (no info)' : 'none'
  })

  // canvas pixels by default (exact, works for headless WebGPU); --page for the whole page incl. DOM
  const png = a.page
    ? await page.screenshot({ encoding: 'base64' })
    : (await page.evaluate(() => window.__lab.capture())).split(',')[1]
  // pixel stats in the page itself, so no png decoder dependency
  const stats = await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = new OffscreenCanvas(img.width, img.height).getContext('2d')
    c.drawImage(img, 0, 0)
    const d = c.getImageData(0, 0, img.width, img.height).data
    const bg = [d[0], d[1], d[2]]
    let differ = 0, sum = 0, sq = 0
    const n = d.length / 4
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
      sum += l; sq += l * l
      if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 12) differ++
    }
    const mean = sum / n
    return { corner: bg, mean: +mean.toFixed(1), std: +Math.sqrt(sq / n - mean * mean).toFixed(1), drawn: +((100 * differ) / n).toFixed(2) }
  }, png)

  const name = a.out ?? `${a.scene}-${a.backend}-${a.gpu}`
  await mkdir('shots', { recursive: true })
  await writeFile(`shots/${name}.png`, Buffer.from(png, 'base64'))

  const bench = a.bench ? await page.evaluate((n) => window.__lab.bench(n), +a.bench) : undefined
  const blank = stats.drawn < 1 || stats.std < 2
  console.log(JSON.stringify({ name, ...lab, params: undefined, webgpuAdapter: webgpu, ...stats, blank, bench, problems }, null, 1))
  if (logs.length) console.log(logs.join('\n'))
  code = blank ? 1 : 0
  if (problems.length) { console.log(`FAIL ${problems.length} problem(s), not retried`); code = 2 }
  await page.close()
} catch (e) {
  console.error('shot failed:', e.message)
  // an error while loading (a scene that throws in create) ends in the ready timeout: report it as the page error
  // it is, exit 2, and don't retry it as if the frame were blank (review of de0c4b1)
  if (problems.length) { console.log(`FAIL ${problems.length} problem(s): ${problems.join(' | ')}`); code = 2 }
}
await browser.close()
await server.close()
process.exit(code)

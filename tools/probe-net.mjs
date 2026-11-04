// one-off: which requests fail or never finish while the loader is stuck? (M1 debugging)
import puppeteer from 'puppeteer-core'
const gpu = process.argv[2] !== 'sw'
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/brave', headless: true,
  args: ['--no-first-run', '--autoplay-policy=no-user-gesture-required', ...(gpu ? ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] : ['--enable-unsafe-swiftshader'])],
  env: { ...process.env, ...(gpu ? { __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' } : {}) },
  defaultViewport: { width: 1440, height: 900 },
})
const page = await browser.newPage()
await page.setRequestInterception(true)
page.on('request', async (r) => { if (!/\.(ogg|mp3|m4a)(\?|$)/.test(r.url())) return r.continue(); try { const res = await fetch(r.url()); r.respond({ status: 200, contentType: 'audio/ogg', body: Buffer.from(await res.arrayBuffer()) }) } catch { r.abort() } })
const pending = new Map(), done = [], failed = [], logs = []
page.on('request', (r) => pending.set(r, r.url()))
page.on('requestfinished', (r) => { pending.delete(r); done.push(r.url()) })
page.on('requestfailed', (r) => { pending.delete(r); failed.push(`${r.failure()?.errorText} ${r.url()}`) })
page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`))
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message.slice(0, 200)}`))
await page.goto('https://santionispirits.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await new Promise((r) => setTimeout(r, 40000))
const short = (u) => u.replace('https://santionispirits.com/', '/').slice(0, 140)
console.log('finished', done.length, 'pending', pending.size, 'failed', failed.length)
console.log('PENDING', [...pending.values()].map(short).slice(0, 20))
console.log('FAILED', failed.map(short).slice(0, 20))
const ext = {}; for (const u of done) { const e = (u.split('?')[0].match(/\.([a-z0-9]+)$/) || [, 'none'])[1]; ext[e] = (ext[e] || 0) + 1 }
console.log('finished by ext', ext)
console.log('LOGS', logs.slice(0, 25))
console.log('JSON', done.filter((u) => /\.json(\?|$)/.test(u)).map(short))
await browser.close()

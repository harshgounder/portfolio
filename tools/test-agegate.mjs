// behaviour test for access/agegate.js inside the story scene (headless Brave)
import puppeteer from 'puppeteer-core'
import { createServer } from 'vite'
const server = await createServer({ root: new URL('..', import.meta.url).pathname, logLevel: 'error', server: { port: 0 } })
await server.listen()
const browser = await puppeteer.launch({ executablePath: '/usr/bin/brave', headless: true, args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'],
  env: { ...process.env, __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' },
  defaultViewport: { width: 1280, height: 800 } })
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`) }
async function open(mode) {
  const page = await browser.newPage()
  await page.goto(`${server.resolvedUrls.local[0]}?scene=story&gate=${mode}`)
  await page.waitForFunction(() => window.__lab?.ready, { timeout: 30000 })
  return page
}
const state = (page) => page.evaluate(() => ({
  gateHidden: document.querySelector('.agegate').hidden, denied: !document.querySelector('.agegate-denied').hidden,
  inert: [...document.querySelectorAll('.beat')].every((b) => b.inert), focus: document.activeElement?.textContent?.trim() || document.activeElement?.name,
  role: document.querySelector('.agegate').getAttribute('role'), modal: document.querySelector('.agegate').getAttribute('aria-modal') }))

let p = await open('yesno'); let s = await state(p)
check('yesno: dialog semantics', s.role === 'dialog' && s.modal === 'true')
check('yesno: story inert while open', s.inert)
check('yesno: first button focused', s.focus === 'Yes', `(focus=${s.focus})`)
await p.click('[data-answer="no"]'); s = await state(p)
check('yesno: No shows denial, gate stays', s.denied && !s.gateHidden)
await p.keyboard.down('Shift'); await p.keyboard.press('Tab'); await p.keyboard.up('Shift'); await p.keyboard.press('Enter'); s = await state(p)
check('yesno: keyboard Yes passes + story live', s.gateHidden && !s.inert)
await p.close()

p = await open('dob')
const submit = async (d, m, y) => { await p.evaluate(() => document.querySelectorAll('.agegate input').forEach((i) => (i.value = ''))); await p.type('input[name=d]', d); await p.type('input[name=m]', m); await p.type('input[name=y]', y); await p.click('.agegate .action') }
const now = new Date()
await submit('15', '6', String(now.getFullYear() - 10)); s = await state(p)
check('dob: 10-year-old denied', s.denied && !s.gateHidden)
await submit('15', '6', String(now.getFullYear() - 10).slice(2)); s = await state(p)
check('dob: 2-digit year denied (was read as 19xx, review #1)', s.denied && !s.gateHidden)
await submit('1', '1', '201'); s = await state(p)
check('dob: 3-digit year denied', s.denied && !s.gateHidden)
await submit('1', '1', String(now.getFullYear() + 1)); s = await state(p)
check('dob: future year denied', s.denied && !s.gateHidden)
await submit('31', '2', '1990'); s = await state(p)
check('dob: impossible date (31 Feb) denied', s.denied && !s.gateHidden)
await submit('1', '1', '1990'); s = await state(p)
check('dob: adult passes', s.gateHidden && !s.inert)
await new Promise((r) => setTimeout(r, 200))
const focusTag = await p.evaluate(() => document.activeElement?.tagName)
check('focus moves to the story heading after passing (not <body>)', focusTag === 'H1', `(focus=${focusTag})`)
await p.close()
await browser.close(); await server.close()
console.log(`${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1)

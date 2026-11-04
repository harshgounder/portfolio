// retarget probe (review #8): the bare character + a borrowed walk (scenes/hatch.js retargetFromRest) against the
// same walk retargeted in Blender (mapmaker-walk.local.glb, local only: the Xbot walk is Mixamo-derived).
// compares world joint positions (head, hands, feet) at 8 times through the clip. usage: node tools/retarget-probe.mjs
// PASS: median joint error <= 3 cm and max <= 5 cm (measured 1.5 / 2.0; change-from-rest alone gave 42 cm max: hands crossed). needs the local files (exit 3 = skipped when they are missing).
import puppeteer from 'puppeteer-core'
import { createServer } from 'vite'
import { existsSync } from 'node:fs'
const root = new URL('..', import.meta.url).pathname
if (!existsSync(`${root}public/models/Xbot.glb`) || !existsSync(`${root}public/chars/mapmaker-walk.local.min.glb`)) { console.log('SKIP local test files missing'); process.exit(3) }
const server = await createServer({ root, logLevel: 'error', server: { port: 0 } }); await server.listen()
const browser = await puppeteer.launch({ executablePath: '/usr/bin/brave', headless: true, args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'],
  env: { ...process.env, __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' },
  defaultViewport: { width: 1280, height: 800 } })
const page = await browser.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message))
await page.goto(`${server.resolvedUrls.local[0]}?scene=hatch&preset=borrowed-local&t=0`)
await page.waitForFunction(() => window.__lab?.ready, { timeout: 30000 })
const r = await page.evaluate(async (process_dbg) => {
  const THREE = await import('/node_modules/.vite/deps/three.js')
  const ref = await window.__lab.world.loader.loadAsync('/chars/mapmaker-walk.local.min.glb')
  const refMixer = new THREE.AnimationMixer(ref.scene); refMixer.clipAction(ref.animations[0]).play()
  const w = window.__lab.world, p = window.__lab.params
  const names = ['Head', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'LeftForeArm', 'RightLeg']
  const find = (rootObj, n) => { let b = null; rootObj.traverse((o) => { if (!b && o.isBone && o.name.endsWith(n)) b = o }); return b }
  window.__dbg = process_dbg ? [] : null; const errs = [], dur = Math.min(ref.animations[0].duration, w.clipDuration)
  for (let k = 0; k < 8; k++) {
    const t = (k / 8) * dur
    p.animate = false; p.rest = false; p.pose = t; w.update(t); w.model.updateMatrixWorld(true)
    refMixer.setTime(t); ref.scene.updateMatrixWorld(true)
    for (const n of names) {
      const a = find(w.model, n).getWorldPosition(new THREE.Vector3()), b = find(ref.scene, n).getWorldPosition(new THREE.Vector3())
      errs.push(a.distanceTo(b)); if (window.__dbg) window.__dbg.push([k, n, +a.distanceTo(b).toFixed(3), a.toArray().map((x) => +x.toFixed(2)), b.toArray().map((x) => +x.toFixed(2))])
    }
  }
  errs.sort((x, y) => x - y); const dbg = window.__dbg
  return { dbg, n: errs.length, median: errs[errs.length >> 1], max: errs.at(-1), durs: [ref.animations[0].duration, w.clipDuration] }
}, !!process.env.DBG)
if (r.dbg) for (const row of r.dbg.filter((x) => x[2] > 0.06)) console.log(JSON.stringify(row))
await browser.close(); await server.close()
if (errors.length) { console.log('page errors:', errors.join(' | ')); process.exit(1) }
const ok = r.median <= 0.03 && r.max <= 0.05
console.log(`joint error vs the Blender retarget over ${r.n} samples: median ${(r.median * 100).toFixed(1)} cm, max ${(r.max * 100).toFixed(1)} cm (clip ${r.durs.map((d) => d.toFixed(3)).join(' / ')} s)`)
console.log(`${ok ? 'PASS' : 'FAIL'} borrowed walk matches the Blender retarget`)
process.exit(ok ? 0 : 1)

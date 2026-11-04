// swim probe (slice-1 review #17): do the hatch lines stay on the body while it walks?
// usage: node tools/swim-probe.mjs   (exit 1 on failure)
// checks: (1) every skinned mesh of the figure carries the baked `hatchPos` (scenes/hatch.js bakeHatchPos), (2) in the
// SAME units as what is drawn: per mesh, hatchPos bounding-box size / skinned size within 0.8-1.25 (the raw
// `position` failed this: hat 2.0 m vs 0.48 m), (3) both shaders read hatchPos (source check: the shader can't be
// read back). the numbers show how far the old skinned line space slid per frame.
// the hatch shader puts a line every 1/lineTile m along uLineAxis, in object-attached space. for every vertex of the
// walking figure this computes that line coordinate s (in line periods) at walk time t and t + 1/60 s, from
//   skinned: the posed vertex (what v1 used, `transformed` after skinning)
//   rest:    the rest-pose vertex (what the reference does: raw `position`, research/decode-01)
// |delta s| per 60 fps frame is how far the pattern slides over the surface. a line slides a whole period after a
// few frames at 0.25 per frame: that reads as lines crawling over a moving arm, not lines drawn on it.
// boil is separate (the pattern re-seeds 8x a second on purpose); this measures the sliding between boil steps.
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'
const root = new URL('..', import.meta.url).pathname
const server = await createServer({ root, logLevel: 'error', server: { port: 0 } })
await server.listen()
const browser = await puppeteer.launch({ executablePath: '/usr/bin/brave', headless: true, args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'],
  env: { ...process.env, __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' },
  defaultViewport: { width: 1280, height: 800 } })
const page = await browser.newPage()
const errors = []; page.on('pageerror', (e) => errors.push(e.message))
await page.goto(`${server.resolvedUrls.local[0]}?scene=story&t=1.5`)
await page.waitForFunction(() => window.__lab?.ready && window.__world, { timeout: 30000 })
const r = await page.evaluate(async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js')
  const w = window.__world, p = window.__lab.params
  const axis = new THREE.Vector3(Math.cos(p.lineAngle), Math.sin(p.lineAngle), p.lineTilt).normalize()
  const meshes = []; w.model.traverse((o) => { if (o.isSkinnedMesh && o.material?.type === 'ShaderMaterial' && o.material.side !== THREE.BackSide) meshes.push(o) })
  const v = new THREE.Vector3(), m3 = new THREE.Matrix3()
  const sample = (time, rest) => {
    p.animate = false; p.pose = time; p.rest = false; w.update(time); w.model.updateMatrixWorld(true)
    const out = []
    for (const o of meshes) {
      m3.setFromMatrix4(o.matrixWorld)
      const pos = o.geometry.attributes.position
      for (let i = 0; i < pos.count; i += 7) {
        if (rest) v.fromBufferAttribute(o.geometry.attributes.hatchPos, i); else o.getVertexPosition(i, v)
        out.push(v.applyMatrix3(m3).dot(axis) * p.lineTile)
      }
    }
    return out
  }
  const res = {}
  for (const rest of [false, true]) {
    const d = []
    for (const t0 of [0.1, 0.4, 0.7, 1.0]) { const a = sample(t0, rest), b = sample(t0 + 1 / 60, rest); for (let i = 0; i < a.length; i++) d.push(Math.abs(b[i] - a[i])) }
    d.sort((x, y) => x - y)
    res[rest ? 'baked' : 'skinned'] = { n: d.length, median: d[d.length >> 1], p90: d[Math.floor(d.length * 0.9)], over_quarter_pct: (100 * d.filter((x) => x > 0.25).length) / d.length }
  }
  // units: hatchPos box vs skinned box, per mesh (largest axis)
  sample(0.5, false)
  const units = meshes.map((o) => {
    const hp = o.geometry.attributes.hatchPos; if (!hp) return { name: o.name, ratio: null }
    const a = new THREE.Box3(), b = new THREE.Box3()
    for (let i = 0; i < hp.count; i++) { a.expandByPoint(v.fromBufferAttribute(hp, i)); o.getVertexPosition(i, v); b.expandByPoint(v) }
    const sa = a.getSize(new THREE.Vector3()), sb = b.getSize(new THREE.Vector3())
    return { name: o.name, ratio: Math.max(sa.x, sa.y, sa.z) / Math.max(sb.x, sb.y, sb.z) }
  })
  return { lineTile: p.lineTile, meshes: meshes.map((o) => o.name), units, bakeMs: w.hatchBakeMs, ...res }
})
await browser.close(); await server.close()
if (errors.length) { console.log('page errors:', errors.join(' | ')); process.exit(1) }
const f = (x) => x.toFixed(3)
console.log(`lineTile ${r.lineTile}, meshes ${r.meshes.join(', ')}`)
console.log('hatchPos size / skinned size: ' + r.units.map((u) => `${u.name.replace('mapmaker_', '')} ${u.ratio?.toFixed(3) ?? 'MISSING'}`).join(', ') + `; bake ${r.bakeMs?.toFixed(0)} ms`)
for (const k of ['skinned', 'baked']) console.log(`${k.padEnd(8)} |delta s| per 60 fps frame (line periods): median ${f(r[k].median)}, p90 ${f(r[k].p90)}, > 0.25 on ${r[k].over_quarter_pct.toFixed(1)}% of ${r[k].n} samples`)
const glsl = readFileSync(`${root}src/look/hatch.js`, 'utf8'), tsl = readFileSync(`${root}src/look/hatch-tsl.js`, 'utf8')
const unitsOk = r.units.every((u) => u.ratio !== null && u.ratio >= 0.8 && u.ratio <= 1.25)
const srcOk = /vPosO = mat3\(modelMatrix\) \* hatchPos;/.test(glsl) && /attribute\('hatchPos', 'vec3'\)/.test(tsl)
const ok = unitsOk && srcOk && r.baked.median === 0 && r.skinned.median > 0.05
console.log(`${ok ? 'PASS' : 'FAIL'} hatch lines fixed on the surface in world units (units ${unitsOk}, shaders ${srcOk}; the skinned line space swims a median ${f(r.skinned.median)} periods per frame)`)
process.exit(ok ? 0 : 1)

import * as THREE from 'three'
import { flags } from './flags.js'

const scenes = {
  smoke: () => import('./scenes/smoke.js'),
  hatch: () => import('./scenes/hatch.js'),
  panel: () => import('./scenes/panel.js'),
  story: () => import('./scenes/story.js'),
  crumble: () => import('./scenes/crumble.js'),
  inks: () => import('./scenes/inks.js'),
  portfolio: () => import('./scenes/portfolio.js'),
}

async function createRenderer() {
  if (flags.backend !== 'webgpu') return new THREE.WebGLRenderer({ antialias: true })
  const { WebGPURenderer } = await import('three/webgpu')
  const renderer = new WebGPURenderer({ antialias: true })
  await renderer.init()
  return renderer
}

function describe(renderer) {
  if (renderer.isWebGPURenderer) return { backend: renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2 (webgpu fallback)' }
  const gl = renderer.getContext()
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  return { backend: 'webgl2', gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) }
}

const renderer = await createRenderer()
renderer.setPixelRatio(flags.dpr)
renderer.setSize(innerWidth, innerHeight)
document.body.append(renderer.domElement)

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100)
camera.position.set(0, 0, 8)

const name = flags.scene ?? document.body.dataset.scene ?? 'portfolio'
const mod = await (scenes[name] ?? scenes.portfolio)()
if (flags.preset) {
  const res = await fetch(`${import.meta.env.BASE_URL}presets/${flags.scene}.${flags.preset}.json`)
  // the dev server answers a missing file with index.html (200), so check the type, not only res.ok
  if (res.ok && /json/.test(res.headers.get('content-type') ?? '')) Object.assign(mod.params, await res.json())
  else console.warn(`preset ${flags.preset} not found`)
}
const world = await mod.create({ renderer, camera })
if (flags.panel) (await import('./panel.js')).createPanel(mod.params, flags.scene, mod.ranges)

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

function frame(t) {
  world.update(t)
  if (world.render) world.render(camera, t) // scenes with a post pass draw themselves
  else renderer.render(world.scene, camera)
}

// read by tools/shot.mjs. capture() renders and reads the canvas in the same task,
// before the frame is presented, so it works for WebGL and WebGPU without preserveDrawingBuffer
// quality tiers (look/tiers.js): adaptive unless ?tier=N fixes one or ?dpr / ?tier=off turns it off
const { createTiers, TIERS } = await import('./look/tiers.js')
const applyTier = (q) => { renderer.setPixelRatio(q.dpr); renderer.setSize(innerWidth, innerHeight); world.setQuality?.(q) }
const fixed = /^\d$/.test(flags.tier) ? Math.min(TIERS.length - 1, +flags.tier) : null
const tiers = flags.tier === 'off' ? null : createTiers({ start: fixed ?? TIERS.length - 1, deviceDpr: flags.dpr,
  onChange: (q, why) => { console.info(`quality tier -> ${q.name} (dpr ${q.dpr}, msaa ${q.samples}): ${why}`); applyTier(q) } })
if (tiers) applyTier(tiers.settings())
let lastMs = null

const lab = (window.__lab = {
  ...describe(renderer),
  frames: 0,
  ready: false,
  params: mod.params,   // live scene params, for probes (tools/inset-probe.mjs)
  world,                // the scene's world object, for probes (tools/retarget-probe.mjs)
  tiers,                // quality tier controller (null when off), for tests (tools/test-tiers.mjs)
  renderer,             // for tests (pixel ratio)
  capture: (t = flags.t ?? 0) => (frame(t), renderer.domElement.toDataURL('image/png')),
  // ms per frame with the GPU finished each time (WebGL: 1-pixel readback; WebGPU: queue done)
  async bench(n = 200) {
    renderer.setAnimationLoop(null)
    const gl = renderer.isWebGPURenderer ? null : renderer.getContext()
    const px = new Uint8Array(4)
    const sync = gl ? async () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
      : renderer.backend.isWebGPUBackend ? () => renderer.backend.device.queue.onSubmittedWorkDone()
      : async () => { const c = renderer.backend.gl; c.readPixels(0, 0, 1, 1, c.RGBA, c.UNSIGNED_BYTE, px) }
    for (let i = 0; i < 20; i++) { frame(i / 60); await sync() }        // warm-up (shader compile)
    const ms = []
    for (let i = 0; i < n; i++) { const t0 = performance.now(); frame(1 + i / 60); await sync(); ms.push(performance.now() - t0) }
    ms.sort((a, b) => a - b)
    return { n, median: +ms[n >> 1].toFixed(2), p90: +ms[Math.floor(n * 0.9)].toFixed(2) }
  },
})

renderer.setAnimationLoop((ms) => {
  if (tiers && fixed === null && lastMs !== null) tiers.update(ms - lastMs)
  lastMs = ms
  frame(flags.t ?? ms / 1000)
  if (++lab.frames === 3) lab.ready = true
})

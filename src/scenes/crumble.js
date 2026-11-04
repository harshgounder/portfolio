import '../look/panel.css'
import * as THREE from 'three'
import { createHatch, hatchParams, hatchRanges } from '../look/hatch.js'
import { createPanel, panelParams, panelRanges } from '../look/panel.js'
import { colonnade } from '../look/crumble.js'

// slice 2: the crumble on its own (?scene=crumble): a code-built colonnade, fractured at load, breaking apart on a
// red ground inside a comic panel. `crumble` 0..1 is the progress (the story scrubs it with the scroll); `auto`
// sweeps it with time for a look check. the pointer pushes the chunks near it.
export const params = Object.assign({ ...hatchParams }, panelParams, {
  crumble: 0.5, auto: false, spread: 0.6, lift: 1.4, spin: 1.8, stagger: 0.6, push: 0.9,
  env: false, sky: '#ab1d18', skin: '#ffffff',
})
export const ranges = { ...hatchRanges, ...panelRanges, crumble: { min: 0, max: 1 }, spread: { min: 0, max: 3 }, lift: { min: 0, max: 4 },
  spin: { min: 0, max: 6 }, stagger: { min: 0, max: 0.95 }, push: { min: 0, max: 2 } }

// one colonnade ready to draw with the hatch look: fill + outline hull sharing the crumble uniforms
export function createColonnade(hatch, opts) {
  const t0 = performance.now()
  const geometry = colonnade(opts)
  const ms = performance.now() - t0
  const m = hatch.crumbleMaterials({ midKey: 'skin' })
  const piv = geometry.attributes.pivot
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < piv.count; i++) { const y = piv.getY(i); lo = Math.min(lo, y); hi = Math.max(hi, y) }
  m.uniforms.uCrumbleY.value.set(lo, hi)
  const mesh = new THREE.Mesh(geometry, m.fill), hull = new THREE.Mesh(geometry, m.outline)
  hatch.bindOutline(hull)
  const group = new THREE.Group(); group.add(mesh, hull)
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3()
  return {
    group, buildMs: ms, chunks: new Set(Array.from(geometry.attributes.rank.array)).size, triangles: geometry.attributes.position.count / 3,
    // progress 0..1, the shape knobs, and the pointer in NDC (or null) seen through `camera`
    set(p, k, camera, pointer) {
      const u = m.uniforms
      u.uCrumble.value = k
      u.uCrumbleShape.value.set(p.spread, p.lift, p.spin, p.stagger)
      if (pointer && p.push > 0) {
        ray.setFromCamera(pointer, camera)
        if (ray.ray.intersectPlane(plane, hit)) { group.worldToLocal(hit); u.uPointer.value.set(hit.x, hit.y, hit.z, p.push) }
      } else u.uPointer.value.w = 0
    },
  }
}

export async function create({ renderer, camera }) {
  const scene = new THREE.Scene()
  const hatch = createHatch()
  const col = createColonnade(hatch, { seed: 3 })
  scene.add(col.group)
  const panel = createPanel(renderer)
  const root = Object.assign(document.createElement('div'), { className: 'comic' })
  root.innerHTML = `<div class="panel" aria-hidden="true"></div><p class="caption tl">The old roads crumble behind her.</p>`
  document.body.append(root)
  const pointer = new THREE.Vector2(); let hasPointer = false
  addEventListener('pointermove', (e) => { pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); hasPointer = true })
  await document.fonts.ready
  window.__crumble = col
  const look = new THREE.Vector3()
  return {
    scene,
    update(t) {
      // low and a little to the side, looking up at the lintel (the reference shows architecture from below)
      camera.position.set(1.8, 0.7, 10.5); camera.lookAt(0, 2.6, 0); camera.updateMatrixWorld()
      const k = params.auto ? 0.5 - 0.5 * Math.cos(t * 0.6) : params.crumble
      // same rule as the story's constantSpacing: line density scaled by 3.9 m over the camera distance, so the
      // lines keep their on-screen spacing (unscaled at 10 m they were ~2 px apart and read grey)
      hatch.update({ ...params, lineTile: params.lineTile * (3.9 / camera.position.distanceTo(look.set(0, 2.6, 0))) }, t)
      col.set(params, k, camera, hasPointer ? pointer : null)
    },
    render(cam, t) {
      panel.clear(params)
      panel.renderPanel('crumble', scene, cam, { ...params, ground: { type: 'grain', amount: 1, seed: 7 } }, t,
        { panel: root.querySelector('.panel'), boxes: [root.querySelector('.caption')] }, 0)
      panel.renderGrain(params, t, 0)
    },
  }
}

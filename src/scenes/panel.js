import '../look/panel.css'
import * as THREE from 'three'
import * as hatchScene from './hatch.js'
import { createPanel, panelParams, panelRanges } from '../look/panel.js'

// S2: the walking figure inside a comic panel: rough boiling border, caption boxes, nav pill, cursor badge, paper grain
export const params = Object.assign(hatchScene.params, panelParams, { badge: true, badgeLabel: 'hold' })
export const ranges = { ...hatchScene.ranges, ...panelRanges }

// placeholder story copy (ours), the proof topic comes later
const copy = {
  tl: 'A lone mapmaker walks out into the fog.',
  br: 'Every line she draws is a road someone will take.',
  pill: ['story', 'maps'],
}

export async function create(ctx) {
  const world = await hatchScene.create(ctx)
  const panel = createPanel(ctx.renderer)
  const root = Object.assign(document.createElement('div'), { className: 'comic' })
  root.innerHTML = `
    <div class="panel" aria-hidden="true"></div>
    <p class="caption tl">${copy.tl}</p>
    <p class="caption br">${copy.br}</p>
    <nav class="pill">${copy.pill.map((w) => `<span>${w}</span>`).join('')}</nav>
    <div class="badge" aria-hidden="true"><span></span></div>`
  document.body.append(root)
  const $ = (s) => root.querySelector(s)
  const badgeEl = $('.badge'), badgeText = $('.badge span')
  const badge = { x: innerWidth * 0.68, y: innerHeight * 0.62, r: 34, visible: true }
  addEventListener('pointermove', (e) => { badge.x = e.clientX; badge.y = e.clientY })
  await document.fonts.ready

  const shadow = { x: 0, y: 0, w: 0 }
  const layout = { panel: $('.panel'), boxes: [$('.caption.tl'), $('.caption.br'), $('.pill')], badge, shadow }
  // cast shadow: project the figure's feet (world origin) and a point 0.45 m to the side into CSS px
  const v = new THREE.Vector3(), w = new THREE.Vector3()
  const toCss = (vec) => [(vec.x * 0.5 + 0.5) * innerWidth, (-vec.y * 0.5 + 0.5) * innerHeight]
  return {
    scene: world.scene,
    update: world.update,
    render(camera, t) {
      badge.visible = params.badge
      badgeEl.style.transform = `translate(${badge.x}px, ${badge.y}px)`
      badgeText.textContent = params.badge ? params.badgeLabel : ''
      const [fx, fy] = toCss(v.set(0, 0.02, 0).project(camera)), [sx] = toCss(w.set(0.45, 0.02, 0).project(camera))
      Object.assign(shadow, { x: fx + (sx - fx) * 0.35, y: fy, w: Math.abs(sx - fx) })
      panel.render(world.scene, camera, params, t, layout)
    },
  }
}

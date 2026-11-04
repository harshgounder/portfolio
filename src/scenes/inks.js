import '../look/panel.css'
import * as THREE from 'three'
import { createHatch, hatchParams, hatchRanges } from '../look/hatch.js'
import { createPanel, panelParams, panelRanges } from '../look/panel.js'
import { createBottle, createRefraction } from '../look/glass.js'
import { createCarousel } from '../look/carousel.js'

// slice 2: the carousel + glass on their own (?scene=inks): three ink bottles on a row, the selected one in the
// middle. only the selected ink shows its colour (art bible regime b: one saturated accent on ONE object; the
// others stay tan until they arrive). ground marks bend through the glass (look/glass.js refraction pass).
export const INKS = [
  // saturated hues only: a dark low-chroma ink (an 'iron gall' #3a3a44 was tried) hatches into grey mush (bible: no grey)
  { name: 'Vermilion', color: '#c2361d' },
  { name: 'Indigo', color: '#2f4a8a' },
  { name: 'Viridian', color: '#1f7a5c' },
]
export const params = Object.assign({ ...hatchParams }, panelParams, { env: false, sky: '#ffffff', refractPx: 26, spacing: 0.42 })   // sky = the paper slot (#f3f3f3 is paper AFTER grain: the ground read grey)
export const ranges = { ...hatchRanges, ...panelRanges, refractPx: { min: 0, max: 60 }, spacing: { min: 0.2, max: 1 } }

// the row of bottles; set(pos) lays them out around the eased carousel position and colours the liquids
export function createInkRow(hatch, inks = INKS) {
  const group = new THREE.Group(), tan = new THREE.Color(), c = new THREE.Color()
  const bottles = inks.map((ink, i) => {
    const b = createBottle(hatch, { inkKey: `ink${i}`, fill: 0.5 + 0.12 * i }); group.add(b.group); return b
  })
  return {
    group, bottles,
    // k = scroll progress through the beat (0..1): the row turns with it like a turntable, so the beat answers the
    // scroll (it was DEAD in beats.mjs: only the boil moved, 1.9-2.3% between frames)
    set(p, pos, t, k = 0) {
      const n = inks.length
      bottles.forEach((b, i) => {
        let d = i - pos; d -= n * Math.round(d / n)                     // wrap into -n/2 .. n/2
        b.group.position.set(d * p.spacing, 0, -Math.abs(d) * 0.18)
        b.group.rotation.y = d * 0.6 + k * 2.4 + t * 0.05                // turned by the scroll, a little by time
        b.group.visible = Math.abs(d) < 1.6
        const sel = Math.max(0, 1 - Math.abs(d))                         // 1 in the middle .. 0 one step away
        p[`ink${i}`] = '#' + tan.set(p.mid).lerp(c.set(inks[i].color), sel * sel).getHexString()
        b.update(p, t)
      })
    },
  }
}

export async function create({ renderer, camera }) {
  const scene = new THREE.Scene()
  const hatch = createHatch(), row = createInkRow(hatch)
  scene.add(row.group)
  const panel = createPanel(renderer), refraction = createRefraction(renderer)
  const root = Object.assign(document.createElement('div'), { className: 'comic' })
  root.innerHTML = `<div class="panel" aria-hidden="true"></div><p class="caption tl">She chooses her ink.</p><div class="ink-car"></div>`
  document.body.append(root)
  const car = createCarousel(root.querySelector('.ink-car'), { items: INKS, label: 'ink' })
  await document.fonts.ready
  window.__inks = { car, row }
  const look = new THREE.Vector3(0, 0.15, 0)
  return {
    scene,
    update(t) {
      camera.position.set(0, 0.32, 1.25); camera.lookAt(look); camera.updateMatrixWorld()
      const pos = car.update()
      row.set(params, pos, t)
      hatch.update({ ...params, lineTile: params.lineTile * (3.9 / camera.position.distanceTo(look)) }, t)
    },
    render(cam, t) {
      const tex = refraction.render(scene, cam)
      panel.clear(params)
      panel.renderPanel('inks', scene, cam, { ...params, refract: tex, ground: { type: 'grain', amount: 1, seed: 13 } }, t,
        { panel: root.querySelector('.panel'), boxes: [root.querySelector('.caption')] }, 0)
      panel.renderOverlay(params, t, { boxes: [...root.querySelectorAll('.carousel button')], badge: { x: 0, y: 0, r: 0, visible: false } }, 0)
      panel.renderGrain(params, t, 0)
    },
  }
}

// portfolio: one scroll, four spreads and a title. abstract marks only, no character.
// the story engine, the panel compositor and the woodcut materials are the kit's; this file is content + staging.
import * as THREE from 'three'
import '../look/panel.css'
import '../look/portfolio.css'
import { createPanel, panelParams, panelRanges } from '../look/panel.js'
import { createStory } from '../story/story.js'
import { createInkTrail } from '../look/inktrail.js'
import { createColonnade } from './crumble.js'
import { createInkRow } from './inks.js'
import { createTitleSheet } from '../look/titlesheet.js'
import { createHatch, hatchParams, hatchRanges } from '../look/hatch.js'
import content from '../data/content.json'

export const params = Object.assign({}, hatchParams, panelParams, {
  paper: '#f3f3f3', ink: '#151515', mid: '#9c8761', skin: '#ffffff',
  sky: '#f3f3f3', env: false, figure: false, badge: false,
  crumbleShape: { spread: 0.6, lift: 1.4, spin: 1.8, stagger: 0.6, push: 0.9 },
  spacing: 0.46,
})
export const ranges = { ...hatchRanges, ...panelRanges }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const beats = [
  {
    id: 'title', screens: 1.2, full: true, title: true,
    look: (p, k) => ({ ...p, horizon: 0.9 - 0.05 * k, fogPeak: 0, fogAmp: 0.42, billow: 0, sky: '#262626', env: true,
      figure: false, ground: { type: 'grain', amount: 0.7, seed: 3 }, panelStroke: 5 }),
    cam: (k) => [0, 1.0, 3.9, 0.9],
  },
  {
    id: 'about', screens: 2.4,
    look: (p) => ({ ...p, env: false, sky: p.paper, ground: { type: 'gouge', amount: 0.5, tone: 0.2, seed: 9 } }),
    cam: () => [0, 1.0, 4.2, 0.9],
    boxes: () => [...document.querySelectorAll('[data-beat="about"] .fact')],
  },
  {
    id: 'skills', screens: 2.4, world: 'inks',
    look: (p) => ({ ...p, env: false, sky: p.paper, ground: { type: 'grain', amount: 1, seed: 13 } }),
    cam: (k) => ({ pos: [-0.16 + 0.32 * k, 0.34, 3.1 - 0.12 * k], look: [0, 0.2, 0] }),
  },
  {
    id: 'projects', screens: 2.8, world: 'colonnade',
    look: (p) => ({ ...p, env: false, sky: '#ab1d18', ground: { type: 'grain', amount: 1, seed: 11 } }),
    cam: () => ({ pos: [0, 1.2, 16.5], look: [0, 3.0, 0] }),
    boxes: () => [...document.querySelectorAll('[data-beat="projects"] .card')],
  },
  {
    id: 'lab', screens: 2.4,
    look: (p) => ({ ...p, env: false, sky: p.paper, ground: { type: 'grain', amount: 0.8, seed: 17 } }),
    cam: () => [0, 1.0, 4.2, 0.9],
    boxes: () => [...document.querySelectorAll('[data-beat="lab"] .note')],
  },
  {
    id: 'contact', screens: 1.6,
    look: (p, k) => ({ ...p, env: false, sky: '#151515', figure: false,
      ground: { type: 'gouge', amount: 1, tone: -0.2 + 1.1 * Math.min(1, k * 1.4), seed: 5 } }),
    cam: () => [0, 1.0, 3.6, 0.9],
    boxes: () => [...document.querySelectorAll('[data-beat="contact"] .mail')],
  },
]

function pageHtml(b) {
  if (b.id === 'title') {
    const [small, ...big] = content.name.split(' ')
    return `<h1 class="title"><span class="t-small">${esc(small)}</span> <span class="t-big">${esc(big.join(' '))}</span></h1>
      <p class="tagline">${esc(content.tagline)}</p>
      <span class="cue">${esc(content.scrollCue)}</span>`
  }
  if (b.id === 'about') {
    const a = content.about
    return `<div class="page">
      <p class="eyebrow">${esc(a.eyebrow)}</p>
      <h2 id="h-about">${esc(a.heading)}</h2>
      <p class="lede">${esc(a.lede)}</p>
      ${a.body.map((t) => `<p>${esc(t)}</p>`).join('')}
      <dl class="facts">${a.facts.map((f) => `<div class="fact"><dt>${esc(f.k)}</dt><dd>${esc(f.v)}</dd></div>`).join('')}</dl>
    </div>`
  }
  if (b.id === 'skills') {
    const s = content.skills
    return `<div class="page">
      <p class="eyebrow">${esc(s.eyebrow)}</p>
      <h2 id="h-skills">${esc(s.heading)}</h2>
      <p class="lede">${esc(s.lede)}</p>
      ${s.clusters.map((c) => `<div class="cluster">
        <h3>${esc(c.name)}</h3>
        <p class="line">${esc(c.line)}</p>
        <div class="chips">${c.items.map((i) => `<span class="chip">${esc(i)}</span>`).join('')}</div>
      </div>`).join('')}
    </div>`
  }
  if (b.id === 'lab') {
    const l = content.lab
    return `<div class="page">
      <p class="eyebrow">${esc(l.eyebrow)}</p>
      <h2 id="h-lab">${esc(l.heading)}</h2>
      <p class="lede">${esc(l.lede)}</p>
      <ol class="notes">${l.notes.map((n) => `<li class="note">
        <span class="note-tag">${esc(n.tag)}</span>
        <h3>${esc(n.name)}</h3>
        <p class="note-line">${esc(n.line)}</p>
        <p class="note-body">${esc(n.body)}</p>
      </li>`).join('')}</ol>
    </div>`
  }
  if (b.id === 'projects') {
    const pr = content.projects
    return `<div class="page">
      <p class="eyebrow">${esc(pr.eyebrow)}</p>
      <h2 id="h-projects">${esc(pr.heading)}</h2>
      <p class="lede">${esc(pr.lede)}</p>
      <ul class="cards">${pr.items.map((i) => `<li>
        <a class="card" href="work/${esc(i.slug)}.html">
          <span class="card-top"><span class="card-name">${esc(i.name)}</span><span class="card-year">${esc(i.year)}</span></span>
          <span class="card-line">${esc(i.line)}</span>
        </a></li>`).join('')}</ul>
    </div>`
  }
  const c = content.contact
  return `<div class="page">
    <p class="eyebrow">${esc(c.eyebrow)}</p>
    <h2 id="h-contact">${esc(c.heading)}</h2>
    <p class="lede">${esc(c.lede)}</p>
    <a class="mail" href="mailto:${esc(c.email)}">${esc(c.email)}</a>
    <ul class="links">${c.links.map((l) => `<li><span class="label">${esc(l.label)}</span><a class="value" href="${esc(l.href)}">${esc(l.value)}</a></li>`).join('')}</ul>
    <p class="note">${esc(c.note)}</p>
  </div>
  <span class="seal" aria-hidden="true">HG</span>`
}

export async function create(ctx) {
  const panel = createPanel(ctx.renderer)
  const story = createStory(beats)
  const trail = createInkTrail(ctx.renderer)
  const titleSheet = createTitleSheet()

  const root = Object.assign(document.createElement('div'), { className: 'comic' })
  root.innerHTML = beats.map((b) => `<section class="beat ${b.full ? 'full' : 'spread'}" id="${b.id}" data-beat="${b.id}"${b.id !== 'title' ? ` aria-labelledby="h-${b.id}"` : ''}>
      ${pageHtml(b)}
      <div class="panel" aria-hidden="true"></div>
    </section>`).join('') + `<nav class="pill" aria-label="sections">
      ${beats.filter((b) => b.id !== 'title').map((b) => `<a href="#${b.id}" data-goto="${b.id}">${b.id}</a>`).join('')}
    </nav>`
  document.body.append(root)
  const $ = (s) => root.querySelector(s)
  for (const b of beats) b.el = root.querySelector(`[data-beat="${b.id}"]`)

  // nav jumps to a beat's pinned start; the story engine eases the rest
  for (const a of root.querySelectorAll('[data-goto]')) {
    a.addEventListener('click', (e) => {
      const b = beats.find((x) => x.id === a.dataset.goto)
      if (!b) return
      e.preventDefault()
      scrollTo({ top: b.top + b.height * 0.5 - innerHeight * 0.5, behavior: 'auto' })
    })
  }

  // two worlds of their own: ink bottles (skills) and the colonnade (projects)
  const inkHatch = createHatch(), inkRow = createInkRow(inkHatch, content.skills.clusters.map((c) => ({ name: c.name, color: c.color })))
  const inkScene = new THREE.Scene(); inkScene.add(inkRow.group)
  const colHatch = createHatch(), colonnade = createColonnade(colHatch, { seed: 3 })
  const colScene = new THREE.Scene(); colScene.add(colonnade.group)

  const ndc = new THREE.Vector2(); let hasPointer = false
  addEventListener('pointermove', (e) => { ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); hasPointer = true })

  let lastT = 0
  const cam = ctx.camera
  const baseTile = params.lineTile
  const look = new THREE.Vector3()
  const aim = (c) => {
    if (Array.isArray(c)) { cam.position.set(c[0], c[1], c[2]); look.set(c[0] * 0.3, c[3], 0) }
    else { cam.position.set(...c.pos); look.set(...c.look) }
    cam.lookAt(look); cam.updateMatrixWorld()
  }
  const still = matchMedia('(prefers-reduced-motion: reduce)')
  const setTile = (target, viewH) => { params.lineTile = baseTile * (3.9 / Math.max(0.3, cam.position.distanceTo(target))) * (viewH / innerHeight) }

  return {
    scene: new THREE.Scene(),
    update() {},
    render(camera, t) {
      lastT = t
      params.boilFps = still.matches ? 0 : 8
      const s = story.update()
      for (const b of s.beats) {
        b.el.style.transform = `translateY(${b.offset}px)`
        b.el.style.visibility = b.visible ? 'visible' : 'hidden'
      }
      s.beats.forEach((b, i) => {
        const next = s.beats[i + 1]
        const cut = next?.visible ? next.el.querySelector('.panel').getBoundingClientRect().top - 12 : innerHeight
        b.el.style.clipPath = cut < innerHeight ? `inset(0 0 ${Math.max(0, innerHeight - cut)}px 0)` : ''
      })
      const trailTex = trail.update(true)
      panel.clear(params)

      for (const b of s.beats) {
        if (!b.visible) continue
        aim(b.cam(b.progress))
        const p = b.look(params, b.progress)
        p.trail = b.id === 'title' ? null : trailTex
        const panelEl = b.el.querySelector('.panel')
        const rect = panelEl.getBoundingClientRect()
        const boxes = (b.boxes?.() ?? []).slice(0, 6)
        if (b.title) {
          const h1 = b.el.querySelector('.title')
          p.title = titleSheet.update([...h1.children])
        }
        if (b.world === 'inks') {
          inkRow.set(params, 0, t, b.progress)
          setTile(look, rect.height)
          inkHatch.update(params, t)
          panel.renderPanel(b.id, inkScene, camera, p, t, { panel: panelEl, boxes, fit: true }, s.y)
          params.lineTile = baseTile
          continue
        }
        if (b.world === 'colonnade') {
          setTile(look, rect.height)
          colHatch.update(params, t)
          colonnade.set(params.crumbleShape, b.progress, camera, hasPointer ? ndc : null)
          panel.renderPanel(b.id, colScene, camera, p, t, { panel: panelEl, boxes, fit: true }, s.y)
          params.lineTile = baseTile
          continue
        }
        panel.renderPanel(b.id, this.scene, camera, p, t, { panel: panelEl, boxes, fit: true }, s.y)
      }
      panel.renderOverlay(params, t, { boxes: [$('.pill')], badge: { x: 0, y: 0, r: 0, visible: false } }, s.y)
      panel.renderGrain(params, t, s.y)
    },
  }
}

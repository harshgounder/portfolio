import * as THREE from 'three'
import '../look/panel.css'
import * as hatchScene from './hatch.js'
import { createPanel, panelParams, panelRanges } from '../look/panel.js'
import { createStory } from '../story/story.js'
import { createAgeGate } from '../access/agegate.js'
import { createInkTrail } from '../look/inktrail.js'
import { createAudio } from '../audio/audio.js'
import { createStorySound } from '../audio/storysound.js'
import { createMapSheet } from '../look/mapsheet.js'
import { createHold } from '../interaction/hold.js'
import { createTitleSheet } from '../look/titlesheet.js'
import { createHatch } from '../look/hatch.js'
import { createColonnade } from './crumble.js'
import { createInkRow, INKS } from './inks.js'
import { createRefraction } from '../look/glass.js'
import { createCarousel } from '../look/carousel.js'
import { flags } from '../flags.js'
import script from './story-script.json'   // captions = voice-over lines (tools/sound/build_vo.py reads the same file)

// slice 2 proof: three beats on one scroll, our own copy and character.
//   fog   (2.5 screens) regime a: paper + tan, calm establishing walk, camera eases in with progress
//   night (1.25)        the night plate: ink sky swallows the fog as the beat plays
//   red   (2)           regime c: close-up on a red ground (#AB1D18 slot)
export const params = Object.assign(hatchScene.params, panelParams, { model: 'mapmaker-walk', badge: true, badgeLabel: 'scroll',
  crumbleShape: { spread: 0.6, lift: 1.4, spin: 1.8, stagger: 0.6, push: 0.9 }, spacing: 0.42 })   // spacing: the ink bottles' row (m)   // CC0 walk (Quaternius library), baked by art/character
export const ranges = { ...hatchScene.ranges, ...panelRanges }

// figure staging per beat: rotation (radians, about y), root position, and the walk clip time that matches it
const SPEED = 1.081                               // m/s, measured by tools/stride.mjs for the CC0 walk
const walkAcross = (k, x0, x1, rot) => ({ rot, pos: [x0 + (x1 - x0) * k, 0, 0], walkT: (Math.abs(x1 - x0) * k) / SPEED })
const walkAway = (k, z0, z1) => ({ rot: Math.PI, pos: [0, 0, z0 + (z1 - z0) * k], walkT: (Math.abs(z1 - z0) * k) / SPEED })
const standWalk = (k, t) => ({ rot: 0, pos: [0, 0, 0], walkT: t })   // walking on the spot, time-driven

const beats = [
  // title plate (slice 2 titles): ink sky, a fog bank rising from the bottom, the title in the display face
  // (Gloock, OFL; closest free match to the reference by measurement, see logs/LOG.md 2026-10-11)
  { id: 'title', screens: 1.25, caption: [], title: script.title,
    look: (p, k) => ({ ...p, horizon: 0.98 - 0.06 * k, fogPeak: 0, fogAmp: 0.3, billow: 1, sky: '#262626', figure: false,
      ground: { type: 'brush', amount: 1, seed: 3 } }),               // charcoal sky with dry-brush drags (reference title)
    cam: (k) => [0, 1.0, 3.9, 0.9],
    sound: { 'drone-low': 0.3, wind: 0.5, 'fog-air': 0.2 } },
  { id: 'fog', screens: 2.5, caption: script.beats.fog,
    // fogAmp 0.46 (panel default 0.32): the ink sky made this calm beat 33-41% black in-panel, over the regime-a
    // band 25-33 (gate v2, lab/tools/gate_beats.py); a sweep put 0.44-0.5 inside it at 0.1/0.5/0.9 of the beat
    look: (p, k) => ({ ...p, horizon: 0.78, fogPeak: 0.5, fogAmp: 0.46, sky: p.ink }),
    // sound (audio/storysound.js): loop gains, scaled by the beat's share of the screen; steps = footsteps
    // bed mix per beat as played: -24 +- 3 LUFS, about 6 dB under the voice (sound bible 3; measured by test-sound)
    sound: { 'drone-low': 0.36, 'fog-air': 0.45, wind: 0.4, steps: 1 },
    // staging (art/QUALITY-AUDIT.md fix 2): a profile walk ACROSS a wide landscape, scrubbed by the scroll at the
    // clip's own ground speed (tools/stride.mjs: 1.081 m/s) so the planted foot never slides; figure small
    stage: (k) => walkAcross(k, -1.7, 1.5, Math.PI / 2),
    cam: (k, f) => ({ pos: [f.root.x * 0.35, 1.15, 6.6], look: [f.root.x * 0.35, 0.95, 0] }),
    // inset close-ups aimed at bones each frame: the face in profile, then the hand
    insets: [
      { cls: 'inset a', at: 0.15, cam: (f) => ({ pos: [f.head.x + 0.18, f.head.y + 0.02, f.head.z + 0.75], look: [f.head.x + 0.05, f.head.y - 0.04, f.head.z] }) },
      { cls: 'inset b', at: 0.45, cam: (f) => ({ pos: [f.hand.x + 0.1, f.hand.y + 0.12, f.hand.z + 0.6], look: [f.hand.x, f.hand.y, f.hand.z] }) },
    ] },
  { id: 'night', screens: 1.25, caption: script.beats.night,
    // the night plate: gouge cuts close in from below until the panel is solid ink (reference 10400-10850);
    // the figure fades out as they rise, the beat ends as an environment plate
    // ramp: the top rows get 0.8 less tone than the bottom (look/panel.js), so -0.55 + 2.94k closes the top at
    // k = 0.8 and holds a clean night plate for the last fifth. with 2.1k the top was still open at 0.9 (86% ink)
    // when the red panel slid in: the story never showed its night plate (gate v2)
    look: (p, k) => ({ ...p, env: false, sky: p.paper,
      ground: { type: 'gouge', amount: 1, tone: -0.55 + 2.94 * k, seed: 5 } }),
    sound: { 'drone-low': 0.45, night: (k) => 0.2 + 0.3 * k, wind: (k) => 0.3 * (1 - k), steps: (k) => 1 - k },
    cam: (k) => [0, 1.0, 3.4, 0.9] },
  { id: 'red', screens: 2, caption: script.beats.red,
    look: (p) => ({ ...p, env: false, sky: '#ab1d18', mid: '#b09c76', trail: true, ground: { type: 'grain', amount: 1, seed: 7 } }),
    // motif 0.6: at 1.0 this beat's bed mix was -19.5 LUFS (louder than the band; a 4 s test window hid it)
    sound: { motif: 0.6, 'drone-low': 0.5, draw: 1 }, arrive: 'tear',
    // from behind and below: she walks away into the red (reference 14450), a feet inset halfway
    stage: (k) => walkAway(k, 0.4, -1.4),
    cam: (k, f) => ({ pos: [0.35, 0.55, f.root.z + 2.3], look: [0.05, 1.35, f.root.z] }),
    insets: [
      // low, almost at the ground, looking up under the robe's hem (the flared robe hid the foot from 0.22 m)
      { cls: 'inset b', at: 0.35, cam: (f) => ({ pos: [f.foot.x + 0.5, 0.07, f.foot.z + 0.4], look: [f.foot.x, 0.06, f.foot.z] }) },
    ] },
  // the crumble (slice 2): a code-built colonnade breaks apart as the reader scrolls, top first, stumps stay
  // (look/crumble.js); red ground with wood grain like the beat before it (reference: pillars under a red sky).
  // 2 screens so the break is scrubbed over one screen of scroll; the pointer pushes nearby chunks
  { id: 'crumble', screens: 2, caption: script.beats.crumble, world: 'colonnade',
    look: (p) => ({ ...p, env: false, sky: '#ab1d18', ground: { type: 'grain', amount: 1, seed: 11 } }),
    sound: { 'drone-low': 0.45, rumble: (k) => 0.25 + 0.75 * Math.sin(Math.PI * k) }, arrive: 'crack',
    cam: () => ({ pos: [1.8, 0.7, 10.5], look: [0, 2.6, 0] }) },
  // the pick (slice 2 carousel + glass): three code-built ink bottles, the chosen one in the middle; only it shows its
  // colour (regime b: one accent on one object); the ground's wood grain bends through the glass. 2.5 screens
  // (MOTION.md: a pick gets 2-2.5); buttons, arrow keys and swipe choose (look/carousel.js)
  { id: 'inks', screens: 2.5, caption: script.beats.inks, world: 'inks', carousel: true,
    look: (p) => ({ ...p, env: false, sky: p.paper, ground: { type: 'grain', amount: 1, seed: 13 } }),
    sound: { 'drone-low': 0.4, motif: 0.35 },
    cam: (k) => ({ pos: [-0.22 + 0.44 * k, 0.32, 1.3 - 0.12 * k], look: [0, 0.15, 0] }) },   // a slow drift across and in
  // the hold beat (slice 2 #5): a 4-screen beat (MOTION.md: hold interactions get the most room). holding draws
  // the map's roads (3 s fill, 1 s drain, from the reference); the second caption appears when the map is done
  { id: 'map', screens: 4, caption: script.beats.map, after: script.after?.map ?? [], hold: true,
    look: (p) => ({ ...p, env: false, sky: p.paper, figure: false }),
    cam: (k) => [0, 1.0, 3.9, 0.9],
    sound: { 'drone-low': 0.3, motif: 0.35 } }
]

export async function create(ctx) {
  const world = await hatchScene.create(ctx)
  const panel = createPanel(ctx.renderer)
  const story = createStory(beats)

  const root = Object.assign(document.createElement('div'), { className: 'comic' })
  // the visible title is the page's h1 (its letters are painted by GL, see look/titlesheet.js)
  const [small, ...big] = script.title.split(' ')
  root.innerHTML = beats.map((b) => `
    <section class="beat" data-beat="${b.id}" aria-label="${b.id}">
      ${b.title ? `<h1 class="title"><span class="t-small">${small}</span> <span class="t-big">${big.join(' ')}</span></h1>` : ''}
      <div class="panel" aria-hidden="true"></div>
      ${(b.insets ?? []).map((n) => `<div class="${n.cls}" aria-hidden="true"></div>`).join('')}
      ${b.caption.map((c, i) => `<p class="caption ${i ? 'br' : 'tl'}${(b.after ?? []).includes(i + 1) ? ' after' : ''}">${c}</p>`).join('')}
      ${b.carousel ? '<div class="ink-car"></div>' : ''}
    </section>`).join('') + `
    <nav class="pill"><span>story</span><span>maps</span></nav>
    <div class="badge" aria-hidden="true"><span></span></div>`
  document.body.append(root)
  const $ = (s) => root.querySelector(s)
  for (const b of beats) b.el = root.querySelector(`[data-beat="${b.id}"]`)
  // age gate (?gate=yesno|dob): the story is inert and the page can't scroll until it is passed
  const gate = flags.gate ? createAgeGate({ mode: flags.gate, legalAge: 18 }) : null
  if (gate) {
    for (const b of beats) b.el.inert = true
    document.documentElement.style.overflowY = 'hidden'
    gate.passed.then(() => {
      for (const b of beats) b.el.inert = false; document.documentElement.style.overflowY = 'auto'
      // the focused Yes/Enter button just disappeared: give focus to the story's heading, not <body>
      const h1 = root.querySelector('h1'); if (h1) { h1.tabIndex = -1; h1.focus({ preventScroll: true }) }
    })
  }
  const trail = createInkTrail(ctx.renderer)
  // the crumble beat's own world: its own hatch instance (same params) and scene
  const colHatch = createHatch(), colonnade = createColonnade(colHatch, { seed: 3 })
  const colScene = new THREE.Scene(); colScene.add(colonnade.group)
  const ndc = new THREE.Vector2(); let hasPointer = false
  addEventListener('pointermove', (e) => { ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); hasPointer = true })
  window.__colonnade = colonnade
  // the inks beat's own world: bottles (their own hatch instance), a refraction pass, the carousel controls
  const inkHatch = createHatch(), inkRow = createInkRow(inkHatch), inkScene = new THREE.Scene(); inkScene.add(inkRow.group)
  const refraction = createRefraction(ctx.renderer)
  const inkBeat = beats.find((b) => b.carousel)
  const carousel = createCarousel(inkBeat.el.querySelector('.ink-car'), { items: INKS, label: 'ink', onChange: () => audio?.play('clink', { gain: 0.9 }) })
  window.__carousel = carousel
  const mapBeat = beats.find((b) => b.hold)
  const mapSheet = createMapSheet({ seed: 7 })
  const titleSheet = createTitleSheet()
  const hold = createHold({ area: () => mapBeat.el.querySelector('.panel'), label: 'Hold to draw the map', done: 'The map is finished',
    onComplete: () => {
      mapBeat.el.querySelectorAll('.caption.after').forEach((c) => c.classList.add('shown'))
      audio.play('stamp'); audio.queueVo(`${mapBeat.id}-2`)
    } })
  // sound: the toggle goes first in tab order; nothing plays before a gesture (the gate's yes, or any click)
  const audio = createAudio()
  const sound = createStorySound(audio, { world, gate })
  window.__audio = audio; window.__world = world
  let lastNow = performance.now()
  const nightPlate = new THREE.Scene()                          // nothing to draw: the gate plate is all ink
  // reduced motion: the ink stops boiling (story.js already drops the scroll smoothing)
  const still = matchMedia('(prefers-reduced-motion: reduce)')
  const badge = { x: innerWidth * 0.68, y: innerHeight * 0.62, r: 34, visible: true }
  addEventListener('pointermove', (e) => { badge.x = e.clientX; badge.y = e.clientY })
  await document.fonts.ready

  const cam = ctx.camera, v = new THREE.Vector3(), w = new THREE.Vector3()
  const toCss = (vec) => [(vec.x * 0.5 + 0.5) * innerWidth, (-vec.y * 0.5 + 0.5) * innerHeight]
  window.__story = story
  // keep hatch lines about the same size on screen at any zoom (close-ups were getting fat lines):
  // scale line density by the reference distance over this camera's distance to what it looks at, and by the
  // height the render is drawn at over the screen height: an inset draws the camera's whole view into its own
  // ~211 px instead of the full screen, so the same px spacing needs fewer lines per metre (review #7)
  const baseTile = params.lineTile
  const constantSpacing = (c, target, viewH = innerHeight) => {
    params.lineTile = baseTile * (3.9 / Math.max(0.3, c.position.distanceTo(target))) * (viewH / innerHeight)
    world.update(lastT)
  }
  // apply a beat's staging to the shared figure and return bone positions for its cameras
  const bone = (re) => { let b = null; world.model.traverse((o) => { if (!b && o.isBone && re.test(o.name)) b = o }); return b }
  const bones = { head: bone(/Head$/), hand: bone(/RightHand$/), foot: bone(/LeftFoot$/) }
  const look = new THREE.Vector3()
  const stageFigure = (b, t) => {
    const st = (b.stage ?? standWalk)(b.progress, t)
    b.walkT = st.walkT                                                  // footsteps read this (audio/storysound.js)
    world.model.rotation.y = st.rot; world.model.position.set(...st.pos)
    params.animate = false; params.pose = st.walkT
    world.update(t); world.model.updateMatrixWorld(true)
    const wp = (o) => (o ? o.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3())
    return { root: world.model.position.clone(), head: wp(bones.head), hand: wp(bones.hand), foot: wp(bones.foot) }
  }
  // a camera is { pos, look } (world metres) or the older [x, y, z, lookY] array
  const aim = (c) => {
    if (Array.isArray(c)) { cam.position.set(c[0], c[1], c[2]); look.set(c[0] * 0.3, c[3], 0) }
    else { cam.position.set(...c.pos); look.set(...c.look) }
    cam.lookAt(look); cam.updateMatrixWorld()
  }
  let lastT = 0
  // quality tier (look/tiers.js via main.js): MSAA of the scene targets, the glass refraction pass, the insets
  let quality = { samples: 4, refraction: true, insets: true }

  return {
    scene: world.scene,
    update: world.update,
    setQuality(q) { quality = q; panel.setSamples(q.samples) },
    render(camera, t) {
      lastT = t
      params.boilFps = still.matches ? 0 : 8
      const s = story.update()
      const now = performance.now(), dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now
      sound.update(s, dt)
      const holdP = hold.update(dt, !gate?.open && mapBeat.active && mapBeat.offset === 0)
      if (mapBeat.visible) audio.loop('pen-scratch', hold.holding ? 0.8 : 0, { tc: 0.05 })   // red beat's drawing owns it otherwise
      const trailTex = trail.update(!gate?.open)
      panel.clear(params)
      if (gate?.open) {
        panel.renderPanel('gate', nightPlate, cam, { ...params, env: false, sky: params.ink, panelStroke: 0 }, t, { panel: gate.el }, 0)
        panel.renderOverlay(params, t, { boxes: gate.boxes(), badge: { ...badge, visible: false } }, 0)
        panel.renderGrain(params, t, 0)
        return
      }
      for (const b of s.beats) {
        b.el.style.transform = `translateY(${b.offset}px)`        // the whole beat (panel + captions) slides
        b.el.style.visibility = b.visible ? 'visible' : 'hidden'
      }
      // a beat's HTML ends where the next beat's panel begins (the next panel slides over it)
      s.beats.forEach((b, i) => {
        const next = s.beats[i + 1]
        const cut = next?.visible ? next.el.querySelector('.panel').getBoundingClientRect().top - 12 : innerHeight
        b.el.style.clipPath = cut < innerHeight ? `inset(0 0 ${Math.max(0, innerHeight - cut)}px 0)` : ''
      })
      // the carousel takes focus and clicks only while its beat is active (set every frame: a beat off screen is
      // skipped by the render loop below, which left the controls focusable there)
      const car = inkBeat.el.querySelector('.ink-car')
      if (car.inert === inkBeat.active) car.inert = !inkBeat.active
      if (!inkBeat.visible) refraction.release()
      for (const b of s.beats) {
        if (!b.visible) continue
        const f = b.world ? null : stageFigure(b, t)                  // beats with their own world have no figure
        const c = b.cam(b.progress, f)
        aim(c, f)
        const p = b.look(params, b.progress)
        if (p.trail) p.trail = trailTex
        if (b.hold) p.map = mapSheet.update(b.el.querySelector('.panel').getBoundingClientRect(), holdP, still.matches ? 0 : b.progress)
        if (b.title) {
          const h1 = b.el.querySelector('.title')
          h1.style.transform = still.matches ? '' : `translateY(${(-b.progress * 40).toFixed(1)}px)`   // slow drift up with the scroll
          p.title = titleSheet.update([...h1.children])
        }
        constantSpacing(cam, look)
        if (b.world === 'inks') {
          inkRow.set(params, carousel.update(), t, b.progress)              // writes params.ink0..2 (the liquids' colours)
          inkHatch.update(params, t)
          if (quality.refraction) { p.refract = refraction.render(inkScene, cam); p.refractPx = 26 }
          panel.renderPanel(b.id, inkScene, cam, p, t, { panel: b.el.querySelector('.panel'), boxes: [...b.el.querySelectorAll('.caption, .ink-car button')] }, s.y)
          params.lineTile = baseTile
          continue
        }
        if (b.world === 'colonnade') {
          colHatch.update(params, t)                                       // lineTile already scaled for this camera
          colonnade.set(params.crumbleShape, b.progress, cam, hasPointer ? ndc : null)
          panel.renderPanel(b.id, colScene, cam, p, t, { panel: b.el.querySelector('.panel'), boxes: [...b.el.querySelectorAll('.caption')] }, s.y)
          params.lineTile = baseTile
          continue
        }
        const r = f.root
        const [fx, fy] = toCss(v.set(r.x, 0.02, r.z).project(cam)), [sx] = toCss(w.set(r.x + 0.45, 0.02, r.z).project(cam))
        const shadow = p.env === false || p.figure === false ? null : { x: fx + (sx - fx) * 0.35, y: fy, w: Math.abs(sx - fx) }   // no figure, no cast shadow
        panel.renderPanel(b.id, world.scene, cam, p, t, { panel: b.el.querySelector('.panel'), boxes: [...b.el.querySelectorAll('.caption:not(.after), .caption.shown')], shadow }, s.y)
        ;(b.insets ?? []).forEach((n, i) => {
          const el = b.el.querySelectorAll('.inset')[i]
          const k = quality.insets ? Math.min(1, Math.max(0, (b.progress - n.at) / 0.12)) : 0   // rises over 12% of the beat
          el.style.visibility = k > 0 ? 'visible' : 'hidden'
          el.style.transform = `translateY(${(1 - k * k * (3 - 2 * k)) * 90}px)`
          if (k <= 0) return
          aim(n.cam(f), f)
          constantSpacing(cam, look, el.offsetHeight)
          panel.renderPanel(`${b.id}-inset${i}`, world.scene, cam, { ...p, env: false, sky: p.mid }, t, { panel: el, fit: true }, s.y)
        })
        params.lineTile = baseTile
      }
      badge.visible = params.badge
      $('.badge').style.transform = `translate(${badge.x}px, ${badge.y}px)`
      const onHold = mapBeat.active && mapBeat.offset === 0 && !hold.complete
      badge.fill = onHold ? holdP : 0
      $('.badge span').textContent = params.badge ? (onHold ? 'hold' : params.badgeLabel) : ''
      $('.badge span').style.color = badge.fill > 0.5 ? params.paper : params.ink        // ink rising behind the label
      panel.renderOverlay(params, t, { boxes: [$('.pill'), audio.button, ...(hold.button.hidden ? [] : [hold.button])], badge }, s.y)   // the sound toggle gets the same rough ink box
      panel.renderGrain(params, t, s.y)
    },
  }
}

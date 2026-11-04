// wires the sound graph (audio/audio.js) to the scroll story: what each beat sounds like and which events
// make a sound. the mix per beat is data on the beat (`sound: { loopName: gain | (progress) => gain }`).
//   - bed gains follow how much of the screen each beat holds (its panel slides in and out)
//   - a beat arriving: a whoosh (or the beat's own `arrive` sound, e.g. the paper tear at the red cut),
//     then one pen tick per caption, staggered
//   - footsteps: when the beat's walk time crosses one of the clip's measured foot plants (world.plants), panned a
//     little per foot
//   - drawing: the pen-scratch loop follows pointer speed, panned with the cursor x
//   - voice-over: an arriving beat queues its captions' clips (vo-<beat>-<n>); audio.js plays them when the
//     reader rests; leaving the beat drops them. karaoke: each caption word is a span whose --k goes 0..1
//     from 0.4 s before the word to 0.4 s after it (word times: audio/vo-timestamps.json)
import * as THREE from 'three'

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

export function createStorySound(audio, { world, gate, base = `${import.meta.env.BASE_URL}audio/` }) {
  // caption words -> spans (screen readers still read the sentence as one text)
  let stamps = {}
  fetch(`${base}vo-timestamps.json`).then((r) => (r.ok ? r.json() : {})).then((j) => { stamps = j }).catch(() => {})
  const spans = {}
  document.querySelectorAll('.beat').forEach((beat) => beat.querySelectorAll('.caption').forEach((p, i) => {
    const id = `${beat.dataset.beat}-${i + 1}`
    p.innerHTML = p.textContent.split(' ').map((w) => `<span class="w">${w}</span>`).join(' ')
    spans[id] = [...p.querySelectorAll('.w')]
  }))
  let lit = null, loopNames = null
  const arrived = new Set()
  const lastWalk = new Map()
  const ptr = { x: innerWidth / 2, y: 0, speed: 0, lx: null, ly: null }
  addEventListener('pointermove', (e) => { ptr.x = e.clientX; ptr.y = e.clientY })

  // first gesture anywhere starts sound unless the viewer turned it off before (the gate handles its own)
  // only a press or an activation key counts (Tab to reach the sound button must not start sound)
  const start = (e) => {
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return
    if (gate?.open || audio.muted || e.target.closest?.('.sound-toggle')) return
    audio.unlock(); removeEventListener('pointerdown', start, true); removeEventListener('keydown', start, true)
  }
  addEventListener('pointerdown', start, true); addEventListener('keydown', start, true)
  // the gate's yes / enter is the gesture: unlock inside that click (a denied visitor hears nothing:
  // every gain stays 0 while the gate is open)
  gate?.el.addEventListener('click', (e) => { if (e.target.closest('[data-answer="yes"]') && !audio.muted) audio.unlock() }, true)
  gate?.el.addEventListener('submit', () => { if (!audio.muted) audio.unlock() }, true)

  function update(s, dt) {
    const vh = innerHeight
    const mix = {}
    if (!gate?.open) for (const b of s.beats) {
      const share = Math.max(0, 1 - Math.abs(b.offset) / vh)          // 1 when pinned, 0 off screen
      for (const [name, g] of Object.entries(b.sound ?? {})) mix[name] = Math.min(1, (mix[name] ?? 0) + share * (typeof g === 'function' ? g(b.progress) : g))
      // events: a beat counts as arrived once, when it is active AND sound is ready (a beat already on screen
      // when sound starts arrives at that moment, so the first beat still gets its whoosh, ticks and voice)
      if (b.active && !arrived.has(b.id) && audio.ready && audio.state === 'running') {
        arrived.add(b.id)
        audio.play(b.arrive ?? 'whoosh', { gain: 0.9 })
        b.el.querySelectorAll('.caption').forEach((c, i) => {             // captions marked .after wait for their cue
          if (c.matches('.after:not(.shown)')) return
          audio.play('tick', { when: 0.35 + i * 0.3, pan: i ? 0.35 : -0.35 }); audio.queueVo(`${b.id}-${i + 1}`)
        })
      }
      if (!b.visible && arrived.has(b.id)) { arrived.delete(b.id); b.el.querySelectorAll('.caption').forEach((_, i) => audio.dropVo(`${b.id}-${i + 1}`)) }
    }
    // voice-over + karaoke
    const vo = audio.update(s.y, dt)
    if (lit && lit !== vo?.id) { spans[lit]?.forEach((w) => w.style.removeProperty('--k')); lit = null }
    if (vo && stamps[vo.id] && spans[vo.id]) {
      lit = vo.id
      const words = stamps[vo.id].words.filter((w) => w.type === 'word')
      spans[vo.id].forEach((el, i) => {
        const w = words[i]; if (!w) return
        el.style.setProperty('--k', (smooth(w.start - 0.4, w.start, vo.t) * (1 - smooth(w.end, w.end + 0.4, vo.t))).toFixed(3))
      })
    }
    // every loop any beat names (not a fixed list: a loop added to a new beat, like the crumble's rumble, played
    // silently while the list was ['drone-low', 'fog-air', 'night', 'motif', 'wind']); steps and draw are not loops
    loopNames ??= new Set(s.beats.flatMap((b) => Object.keys(b.sound ?? {})).filter((n) => n !== 'steps' && n !== 'draw'))
    for (const name of loopNames) audio.loop(name, mix[name] ?? 0)

    // footsteps: a step when a beat's own walk time crosses a foot plant of the clip (world.plants), forwards or
    // backwards (scrolling up walks her back), at most 2 per frame; gain = the beat's screen share x its steps level
    const D = world.clipDuration
    if (world.walking && D > 0 && !gate?.open) for (const b of s.beats) {
      const g = Math.max(0, 1 - Math.abs(b.offset) / vh) * (typeof b.sound?.steps === 'function' ? b.sound.steps(b.progress) : b.sound?.steps ?? 0)
      const prev = lastWalk.get(b.id), now = b.walkT
      if (now === undefined) continue
      lastWalk.set(b.id, now)
      if (prev === undefined || g < 0.05 || prev === now) continue
      const lo = Math.min(prev, now), hi = Math.max(prev, now); let n = 0
      for (const pl of world.plants) for (let k = Math.ceil((lo - pl.t) / D); pl.t + k * D <= hi && n < 2; k++) {
        if (pl.t + k * D > lo) { audio.play('step', { gain: 0.8 * g, pan: pl.left ? -0.15 : 0.15 }); n++ }
      }
    }

    // drawing: speed in px/s from pointer motion, eased
    if (ptr.lx !== null && dt > 0) ptr.speed += (Math.hypot(ptr.x - ptr.lx, ptr.y - ptr.ly) / dt - ptr.speed) * Math.min(1, dt * 12)
    ptr.lx = ptr.x; ptr.ly = ptr.y
    const draw = gate?.open ? 0 : (mix.draw ?? 0)
    audio.loop('pen-scratch', draw * Math.min(1, ptr.speed / 1400), { pan: (ptr.x / innerWidth) * 2 - 1, tc: 0.04 })
  }
  return { update }
}

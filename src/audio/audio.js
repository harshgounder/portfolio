// sound (slice 2): one Web Audio graph, rules from art/SOUND-BIBLE.md section 2
//   - nothing plays before a user gesture: unlock() must run inside a click/key handler (the age gate's yes,
//     or the sound button); it also sets navigator.audioSession.type = 'playback' where it exists (iPhone
//     silent switch would otherwise mute Web Audio)
//   - buses: music (all loops start together at one ctx time, gains ridden from scroll), sfx (one-shots,
//     round robins, cursor pan), vo -> a gentle limiter -> master (mute)
//   - voice-over waits for the reader: it starts only after the scroll moved < 0.6 px/frame for 100 ms,
//     and ducks the music bus while it plays
//   - the sound button is the first thing in tab order, its state is remembered (per viewer, best effort)
//   - hidden tab: the context suspends; it resumes when the tab is visible again (unless muted)
//   v2 (2026-10-11, review fixes): touch activation comes on pointerup/click (not pointerdown), the button
//   reflects whether sound is actually RUNNING, mono one-shots keep their level through the stereo panner,
//   the VO duck is its own node (bus volumes survive), one bad file no longer silences everything, a dropped
//   voice blocks the next one until its fade ends
const KEY = 'kit.sound'

export function createAudio({ base = `${import.meta.env.BASE_URL}audio/`, duckDb = -8 } = {}) {
  let ctx = null, buses = null, manifest = null, loading = null
  const buffers = new Map(), loops = new Map(), lastPick = new Map()
  let muted = false
  try { muted = localStorage.getItem(KEY) === 'off' } catch {}

  // the sound button: first in tab order (prepended to <body>), a real <button> with aria-pressed
  const button = Object.assign(document.createElement('button'), { className: 'sound-toggle', type: 'button' })
  // 'on' only when sound can actually be heard: context running and not muted
  const label = () => {
    const on = !!ctx && ctx.state === 'running' && !muted
    button.setAttribute('aria-pressed', String(on))
    button.textContent = on ? 'sound on' : 'sound off'
    button.setAttribute('aria-label', on ? 'turn sound off' : 'turn sound on')
  }
  label()
  document.body.prepend(button)
  button.addEventListener('click', () => {
    if (!ctx) { setMuted(false); unlock() }                          // setMuted also remembers the choice
    else if (!muted && ctx.state !== 'running') ctx.resume()          // created but not running yet (touch): resume, don't mute
    else setMuted(!muted)
    label()
  })

  const pickFormat = () => {
    const a = document.createElement('audio')
    return a.canPlayType('audio/ogg; codecs=opus') ? 0 : 1   // Ogg Opus, else AAC (.m4a)
  }

  // must be called from inside a user gesture handler (creating/resuming the context is the unlock)
  function unlock() {
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: 'interactive' })
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback' } catch {}
      const master = ctx.createGain(); master.gain.value = muted ? 0 : 1
      const limiter = ctx.createDynamicsCompressor()
      limiter.threshold.value = -3; limiter.knee.value = 6; limiter.ratio.value = 12
      limiter.attack.value = 0.003; limiter.release.value = 0.25
      const music = ctx.createGain(), duck = ctx.createGain(), sfx = ctx.createGain(), vo = ctx.createGain()
      music.connect(duck).connect(limiter); sfx.connect(limiter); vo.connect(limiter); limiter.connect(master); master.connect(ctx.destination)
      buses = { master, limiter, music, duck, sfx, vo }
      ctx.onstatechange = label
      document.addEventListener('visibilitychange', () => {
        if (!ctx) return
        if (document.hidden) ctx.suspend(); else if (!muted) ctx.resume()
      })
      // a context created outside a real activation (touch pointerdown is not one), or left 'interrupted' by
      // iOS (a call, another app), resumes on the next activation: pointerup / click / key
      const retry = () => { if (ctx && !muted && ctx.state !== 'running') ctx.resume() }
      for (const ev of ['pointerup', 'click', 'keydown']) addEventListener(ev, retry, true)
      loading = load()
    }
    if (!muted) ctx.resume()
    label()
    return loading
  }

  async function load() {
    manifest = await (await fetch(`${base}manifest.json`)).json()
    const f = pickFormat()
    // one missing or undecodable file must not silence the rest: try the preferred format, then the other
    const fetchDecode = async (file) => {
      const res = await fetch(base + file); if (!res.ok) throw new Error(`${file}: ${res.status}`)
      return ctx.decodeAudioData(await res.arrayBuffer())
    }
    await Promise.all(Object.entries(manifest.sounds).map(async ([name, s]) => {
      for (const file of [s.files[f], s.files[1 - f]]) {
        try { buffers.set(name, await fetchDecode(file)); return } catch (e) { console.warn('sound skipped:', e.message) }
      }
    }))
    // every loop starts at the same context time, silent; scenes ride their gains
    const at = ctx.currentTime + 0.05
    for (const [name, s] of Object.entries(manifest.sounds)) {
      if (!s.loop) continue
      const buf = buffers.get(name); if (!buf) continue
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true
      // the file is [pad: the loop's own tail | loop | pad: its own head] so the codec has context across the
      // wrap (tools/sound/build_sound.py); encoders may also add priming samples in front: skip both
      const pad = s.pad ?? 0, lead = Math.max(0, buf.duration - (s.seconds + 2 * pad)) + pad
      src.loopStart = lead; src.loopEnd = lead + s.seconds
      const gain = ctx.createGain(); gain.gain.value = 0
      const pan = ctx.createStereoPanner()
      src.connect(gain).connect(pan).connect(buses[s.bus]); src.start(at, lead)
      loops.set(name, { src, gain, pan })
    }
    return true
  }

  function setMuted(m) {
    muted = m
    try { localStorage.setItem(KEY, m ? 'off' : 'on') } catch {}
    if (!ctx) return
    buses.master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.08)
    if (!m) ctx.resume()
  }

  // ride a loop: gain 0..1 (eased toward over ~tc seconds), optional pan -1..1
  function loop(name, gain, { pan, tc = 0.25 } = {}) {
    const l = loops.get(name); if (!l) return
    l.gain.gain.setTargetAtTime(gain, ctx.currentTime, tc)
    if (pan !== undefined) l.pan.pan.setTargetAtTime(pan, ctx.currentTime, 0.05)
  }

  // one-shot: name, or a prefix like 'tick' that picks a round-robin variant (never the same one twice running)
  function play(name, { gain = 1, pan = 0, when = 0 } = {}) {
    if (!ctx || ctx.state !== 'running') return
    let key = name
    if (!buffers.has(name)) {
      const opts = [...buffers.keys()].filter((k) => k.startsWith(name + '-'))
      if (!opts.length) return
      const prev = lastPick.get(name)
      const pool = opts.length > 1 ? opts.filter((k) => k !== prev) : opts
      key = pool[Math.floor(Math.random() * pool.length)]; lastPick.set(name, key)
    }
    const src = ctx.createBufferSource(); src.buffer = buffers.get(key)
    // a StereoPanner sends a MONO input at cos(pi/4) per side (-3 dB at centre); the files are levelled
    // "as played" on both speakers, so give mono sources that 3 dB back
    const g = ctx.createGain(); g.gain.value = gain * (src.buffer.numberOfChannels === 1 ? Math.SQRT2 : 1)
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan))
    src.connect(g).connect(p).connect(buses[manifest.sounds[key].bus === 'vo' ? 'vo' : 'sfx'])
    src.start(ctx.currentTime + when)
    return src
  }

  // voice-over queue: scenes add a clip id when its caption is on screen; it plays when the reader rests
  const vo = { queue: [], playing: null, still: 0, lastY: null, fadeUntil: 0 }
  function queueVo(id) { if (manifest?.sounds[`vo-${id}`] && !vo.queue.includes(id) && vo.playing?.id !== id) vo.queue.push(id) }
  function dropVo(id) {
    vo.queue = vo.queue.filter((q) => q !== id)
    if (vo.playing?.id === id) {
      vo.playing.g.gain.setTargetAtTime(0, ctx.currentTime, 0.15); vo.playing.src.stop(ctx.currentTime + 0.6)
      vo.fadeUntil = ctx.currentTime + 0.6; end()                    // no second voice over the fading one
    }
  }
  function end() {
    vo.playing = null
    if (buses) buses.duck.gain.setTargetAtTime(1, ctx.currentTime, 0.4)
  }
  // call every frame with the shown scroll y; returns { id, t } of the playing clip for karaoke
  function update(y, dt) {
    if (!ctx || ctx.state !== 'running') return null
    const delta = vo.lastY === null ? 0 : Math.abs(y - vo.lastY); vo.lastY = y
    vo.still = delta < 0.6 ? vo.still + dt : 0
    if (!vo.playing && vo.queue.length && vo.still >= 0.1 && ctx.currentTime >= vo.fadeUntil && buffers.has(`vo-${vo.queue[0]}`)) {
      const id = vo.queue.shift(), src = ctx.createBufferSource(), g = ctx.createGain()
      src.buffer = buffers.get(`vo-${id}`); src.connect(g).connect(buses.vo)
      const start = ctx.currentTime + 0.05; src.start(start)
      buses.duck.gain.setTargetAtTime(10 ** (duckDb / 20), ctx.currentTime, 0.15)
      vo.playing = { id, src, g, start }
      src.onended = () => { if (vo.playing?.src === src) end() }
    }
    return vo.playing ? { id: vo.playing.id, t: ctx.currentTime - vo.playing.start } : null
  }

  return {
    button, unlock, loop, play, queueVo, dropVo, update, setMuted,
    // per-bus volume (music | sfx | vo), e.g. for a settings panel; the VO duck is a separate node after music
    busGain(name, gain) { if (['music', 'sfx', 'vo'].includes(name) && buses) buses[name].gain.setTargetAtTime(gain, ctx.currentTime, 0.05) },
    get ready() { return !!ctx && buffers.size > 0 && loops.size > 0 },
    get state() { return ctx?.state ?? 'locked' },
    get muted() { return muted },
    debugBus: (name) => (buses ? +buses[name].gain.value.toFixed(3) : null),
    debug: () => ({ state: ctx?.state ?? 'locked', buffers: buffers.size, loops: [...loops].map(([k, l]) => [k, +l.gain.gain.value.toFixed(3)]), music: buses ? +buses.duck.gain.value.toFixed(3) : null, vo: vo.playing?.id ?? null, queue: [...vo.queue] }),
    // for tests: tap the master output (MediaStream) to record what a listener would hear
    tap() { const d = ctx.createMediaStreamDestination(); buses.master.connect(d); return d.stream },
  }
}

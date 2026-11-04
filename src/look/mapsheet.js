// map sheet (slice 2 hold beat): our own procedural map, drawn by a progress value 0..1
//   R channel = ink lines: the coast outline (always there) plus river and roads, revealed along their length
//               as progress grows (the hold draws them), towns appear at the end
//   G channel = sea mask (static), which the compositor fills with 2 px / 4 px water lines (D5 floor rule)
// drawn with Canvas2D at half resolution into a texture that covers the screen; the compositor thresholds it
// with a little boil on the edge, like the ink trail, so the lines read as cut wood, not vector strokes.
import * as THREE from 'three'

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }

export function createMapSheet({ seed = 7, scale = 0.5 } = {}) {
  const canvas = document.createElement('canvas')
  const g = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false
  let shape = null, key = ''

  // the map in unit space (0..1 of the panel): a coast loop, a river from the hills to the sea, roads between towns
  function build() {
    const r = rng(seed)
    const coast = []
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2
      const k = 0.3 + 0.07 * Math.sin(a * 3 + r() * 0.2) + 0.04 * Math.sin(a * 7 + 1.3) + 0.02 * (r() - 0.5)
      coast.push([0.5 + Math.cos(a) * k * 1.25, 0.52 + Math.sin(a) * k])
    }
    const towns = [[0.36, 0.38], [0.6, 0.33], [0.68, 0.6], [0.42, 0.66], [0.52, 0.5]]
    // smooth bends (two sines with random phase, zero at both ends); per-vertex randomness made sawtooth roads
    const wiggle = (a, b, n, amp) => {
      const f1 = 1 + r() * 1.5, f2 = 2.5 + r() * 2, p1 = r() * 6.28, p2 = r() * 6.28
      return Array.from({ length: n + 1 }, (_, i) => {
        const t = i / n, nx = -(b[1] - a[1]), ny = b[0] - a[0]
        const w = Math.sin(t * Math.PI) * amp * (0.6 * Math.sin(t * Math.PI * f1 + p1) + 0.4 * Math.sin(t * Math.PI * f2 + p2)) * 0.5
        return [a[0] + (b[0] - a[0]) * t + nx * w, a[1] + (b[1] - a[1]) * t + ny * w]
      })
    }
    // hills: small peaks inland, drawn as a ridge with three short hatch strokes on the shadow side
    const hills = [[0.3, 0.52], [0.34, 0.46], [0.72, 0.45], [0.76, 0.5], [0.56, 0.7]]
    const river = wiggle([0.5, 0.5], coast[30], 40, 0.5)
    const roads = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [4, 2]].map(([a, b]) => wiggle(towns[a], towns[b], 24, 0.3))
    // reveal order and spans of progress: river first, then the roads one after another, towns last
    const strokes = [{ pts: river, from: 0.0, to: 0.3, width: 5 }]
    roads.forEach((pts, i) => strokes.push({ pts, from: 0.25 + i * 0.11, to: 0.25 + (i + 1) * 0.11 + 0.04, width: 3.2 }))
    return { coast, strokes, towns, hills }
  }

  function path(pts, rect, n = pts.length, begin = true) {
    if (begin) g.beginPath()
    pts.slice(0, n).forEach(([x, y], i) => (i ? g.lineTo : g.moveTo).call(g, rect.x + x * rect.w, rect.y + y * rect.h))
  }
  // a polyline drawn up to fraction f of its length
  function partial(pts, f, rect) {
    if (f <= 0) return
    const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    const target = f * L[L.length - 1]
    let i = 1; while (i < pts.length - 1 && L[i] < target) i++
    const k = (target - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1])
    const end = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * Math.min(1, k), pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * Math.min(1, k)]
    path([...pts.slice(0, i), end], rect)
    g.stroke()
  }

  // panel: DOM rect (CSS px); progress 0..1 (the hold); drift 0..1 (the beat's scroll progress: the sheet
  // slowly zooms in and slides, so the beat is never a frozen image while the reader scrolls)
  function update(panel, progress, drift = 0) {
    const w = Math.round(innerWidth * scale), h = Math.round(innerHeight * scale)
    // a CanvasTexture keeps its first GPU storage size in three r186 (sub-image updates after a resize overflow:
    // GL_INVALID_VALUE, the map froze); a new size needs dispose() so three reallocates on the next upload
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; texture.dispose(); key = '' }
    if (!shape) shape = build()
    const p = Math.round(progress * 400) / 400
    const dr = Math.round(drift * 200) / 200
    const k = `${w}x${h}:${Math.round(panel.x)},${Math.round(panel.y)},${Math.round(panel.width)},${Math.round(panel.height)}:${p}:${dr}`
    if (k === key) return texture
    key = k
    // the map sits in the panel with a margin, keeping its aspect near 4:3
    const zoom = 1 + 0.18 * dr
    const mw = panel.width * 0.86 * zoom, mh = Math.min(panel.height * 0.86, panel.width * 0.86 * 0.75) * zoom
    const rect = { x: (panel.x + (panel.width - mw) / 2 - 40 * dr) * scale, y: (panel.y + (panel.height - mh) / 2 + 20 * dr) * scale, w: mw * scale, h: mh * scale }
    g.globalCompositeOperation = 'source-over'
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h)
    // sea = everything in the map rect outside the coast (green), coast line in red
    // sea = the map rect minus the island (one path, even-odd); the water lines start past the coast ripples
    g.save(); g.beginPath(); g.rect(rect.x, rect.y, rect.w, rect.h); path(shape.coast, rect, undefined, false); g.closePath(); g.clip('evenodd')
    // G = distance from the shore (0 near .. 1 far): the compositor thickens the water lines with it until they
    // merge into solid black at the frame (art bible: lines thicken and merge into the solid mass)
    const grow = (k) => shape.coast.map(([x, y]) => [0.5 + (x - 0.5) * k, 0.52 + (y - 0.52) * k])
    const fillGrown = (k) => { g.beginPath(); grow(k).forEach(([x, y], i) => (i ? g.lineTo : g.moveTo).call(g, rect.x + x * rect.w, rect.y + y * rect.h)); g.closePath(); g.fill() }
    g.fillStyle = '#0f0'; g.fillRect(rect.x, rect.y, rect.w, rect.h)
    for (let i = 0; i <= 14; i++) {                                    // outermost first, each ring a bit nearer
      const k = 2.0 - i * (0.84 / 14), level = 1 - i / 14
      g.fillStyle = `rgb(0,${Math.round(30 + 225 * level)},0)`; fillGrown(k)
    }
    g.fillStyle = '#000'; g.lineJoin = g.lineCap = 'round'; fillGrown(1.16)
    // engraved coast ripples: thin outlines following the shore, spaced wider as they leave it
    g.globalCompositeOperation = 'lighter'; g.strokeStyle = '#f00'
    // (widths in CSS px; thinner lines broke up at half resolution)
    for (const [k, wdt] of [[1.035, 3.2], [1.075, 2.6], [1.125, 2.2]]) { g.lineWidth = wdt * scale; path(grow(k), rect); g.closePath(); g.stroke() }
    g.restore()
    g.globalCompositeOperation = 'lighter'
    g.strokeStyle = '#f00'; g.fillStyle = '#f00'; g.lineJoin = g.lineCap = 'round'
    g.lineWidth = 4 * scale; path(shape.coast, rect); g.closePath(); g.stroke()
    // hills: a ridge and three hatch strokes on the right (shadow) side
    for (const [hx, hy] of shape.hills) {
      const X = rect.x + hx * rect.w, Y = rect.y + hy * rect.h, w = rect.w * 0.035, h = rect.h * 0.06
      g.lineWidth = 2.6 * scale; g.beginPath(); g.moveTo(X - w, Y); g.lineTo(X, Y - h); g.lineTo(X + w, Y); g.stroke()
      g.lineWidth = 1.6 * scale
      for (let j = 1; j <= 3; j++) { const t = j / 4; g.beginPath(); g.moveTo(X + w * t * 0.9, Y - h * (1 - t) * 0.9); g.lineTo(X + w * t * 0.9, Y - 1); g.stroke() }
    }
    g.lineWidth = 3 * scale; g.strokeRect(rect.x, rect.y, rect.w, rect.h)
    for (const s of shape.strokes) {
      g.lineWidth = s.width * scale
      partial(s.pts, Math.min(1, Math.max(0, (p - s.from) / (s.to - s.from))), rect)
    }
    const townK = Math.min(1, Math.max(0, (p - 0.9) / 0.1))
    g.fillStyle = '#f00'
    if (townK > 0) for (const [x, y] of shape.towns) { g.beginPath(); g.arc(rect.x + x * rect.w, rect.y + y * rect.h, 7 * scale * townK, 0, Math.PI * 2); g.fill() }
    texture.needsUpdate = true
    return texture
  }
  return { update, texture }
}

// display titles drawn by GL (slice 2 titles). the HTML keeps a real <h1> (layout, screen readers, selection),
// with transparent text; this module paints each title line into a full-resolution mask texture at the line's
// box, using the line's own computed font, so the compositor can place the letters UNDER the panel's ink
// border and the paper grain pass reaches them (crisp HTML text on top of the grain read as a sticker).
import * as THREE from 'three'

export function createTitleSheet() {
  const canvas = document.createElement('canvas')
  const g = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false
  let key = ''

  // lines: elements whose text is one line each (e.g. spans inside the h1)
  function update(lines) {
    const dpr = Math.min(devicePixelRatio, 2)
    const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr)
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; texture.dispose(); key = '' }   // see mapsheet.js
    const boxes = lines.map((el) => { const r = el.getBoundingClientRect(); return [el, r] }).filter(([, r]) => r.bottom > 0 && r.top < innerHeight && r.width > 0)
    const k = boxes.map(([el, r]) => `${el.textContent}@${r.left.toFixed(1)},${r.top.toFixed(1)},${r.width.toFixed(1)}`).join('|') + `:${w}x${h}`
    if (k === key) return texture
    key = k
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); g.fillStyle = '#000'; g.fillRect(0, 0, w, h)
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'
    for (const [el, r] of boxes) {
      const cs = getComputedStyle(el)
      g.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      if ('letterSpacing' in g) g.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing
      const text = cs.textTransform === 'uppercase' ? el.textContent.toUpperCase() : el.textContent
      const m = g.measureText(text)
      // centre the ink box of the glyphs in the element's box (the DOM line box adds leading above and below)
      const y = r.top + r.height / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2
      g.fillText(text, r.left + r.width / 2, y)
    }
    texture.needsUpdate = true
    return texture
  }
  return { update, texture }
}

// scroll story (slice 2): beats sized in screens on one native scroll, measured grammar from research/m1/MOTION.md
//   - the page keeps native scroll (keyboard, a11y); the shown position eases toward it, closing half the
//     remaining distance every 60 fps frame (Santioni measurement), frame-rate independent; off for reduced motion
//   - each beat owns `screens` of scroll; its panel slides up from below, pins while the beat plays, then slides
//     away (comic panels overlap their neighbours, like position: sticky)
//   - per beat: progress 0..1 across the pinned part, visible, active (trigger offsets, default 0.25 screen)

export function createStory(beats, { gap = 0.25 } = {}) {
  const spacer = Object.assign(document.createElement('div'), { className: 'story-spacer' })
  spacer.style.cssText = 'position:relative;width:1px;pointer-events:none'
  document.body.append(spacer)
  document.documentElement.style.overflowY = 'auto'
  document.body.style.overflow = 'visible'
  const reduce = matchMedia('(prefers-reduced-motion: reduce)')
  let y = scrollY, last = performance.now()

  function layout() {
    let top = 0
    const vh = innerHeight
    for (const b of beats) { b.top = top; b.height = Math.max(1, b.screens) * vh; top += b.height - gap * vh }
    spacer.style.height = `${top + gap * vh}px`
    return top + gap * vh
  }
  let total = layout()
  addEventListener('resize', () => { total = layout() })

  function update(now = performance.now()) {
    // dt >= 0: a timestamp older than the last one (a rAF time vs performance.now()) would give 0.5^negative > 1
    // and push the shown position AWAY from the target
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now
    const target = scrollY
    y = reduce.matches ? target : target + (y - target) * Math.pow(0.5, dt * 60)
    if (Math.abs(target - y) < 0.05) y = target
    const vh = innerHeight
    for (const b of beats) {
      const pinEnd = b.top + b.height - vh
      // panel offset in px: below the screen before its beat, 0 while pinned, above after
      b.offset = y < b.top ? b.top - y : y > pinEnd ? pinEnd - y : 0
      b.progress = Math.min(1, Math.max(0, (y - b.top) / Math.max(1, b.height - vh)))
      b.visible = b.offset > -vh && b.offset < vh
      b.active = b.offset > -vh * (1 - (b.triggerOut ?? 0.25)) && b.offset < vh * (1 - (b.triggerIn ?? 0.25))
    }
    return { y, target, total, beats }
  }
  return { update, layout, get y() { return y } }
}

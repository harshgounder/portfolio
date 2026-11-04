// press-and-hold interaction (slice 2 #5), rules measured in the reference bundle:
//   progress fills 0 -> 1 linearly over `fill` seconds while held, drains linearly over `drain` seconds on release
//   (reference: 3 s / 1 s); page scroll is locked while holding; the control only works while its beat is on
//   screen. kit additions: once complete it stays complete; keyboard hold with Space/Enter on a real <button>;
//   a progressbar + a polite announcement for screen readers; touch long-press menus are suppressed.
export function createHold({ area, fill = 3, drain = 1, label = 'Press and hold', done = 'Done', onComplete } = {}) {
  const root = Object.assign(document.createElement('div'), { className: 'hold' })
  root.innerHTML = `
    <button class="hold-btn" type="button" aria-describedby="hold-help">${label}</button>
    <span id="hold-help" class="sr-only">Press and hold the button, or hold the Space key, for about ${fill} seconds.</span>
    <div class="sr-only" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="${label}"></div>
    <p class="sr-only" aria-live="polite"></p>`
  document.body.append(root)
  const button = root.querySelector('.hold-btn'), bar = root.querySelector('[role=progressbar]'), live = root.querySelector('[aria-live]')
  let progress = 0, holding = false, complete = false, enabled = false, said = -1

  const lock = (on) => { document.documentElement.style.overflowY = on ? 'hidden' : 'auto' }
  const stopScroll = (e) => { if (holding) e.preventDefault() }
  addEventListener('wheel', stopScroll, { passive: false })
  addEventListener('touchmove', stopScroll, { passive: false })
  const start = () => { if (!enabled || complete || holding) return; holding = true; lock(true) }   // aria-disabled after completion: complete blocks it
  const end = () => { if (!holding) return; holding = false; lock(false) }

  const inArea = (e) => { const r = area().getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom }
  addEventListener('pointerdown', (e) => { if (enabled && e.button === 0 && inArea(e) && !e.target.closest('button, a, input')) start() })
  addEventListener('pointerup', end); addEventListener('pointercancel', end); addEventListener('blur', end)
  addEventListener('contextmenu', (e) => { if (enabled && inArea(e)) e.preventDefault() })   // touch long-press
  button.addEventListener('pointerdown', (e) => { e.preventDefault(); start() })
  button.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start() } })
  // release anywhere: Tab can move focus while Space is still down, so listen on window and on blur too
  addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') end() })
  button.addEventListener('blur', end)
  button.addEventListener('click', (e) => e.preventDefault())

  // call every frame; on = whether the hold's beat is on screen
  function update(dt, on) {
    if (on !== enabled) {
      enabled = on; if (!on) end()
      // leaving the beat while the button has focus: hand focus to the beat instead of dropping it to <body>
      if (!on && document.activeElement === button) { const beat = area().closest('.beat'); beat.tabIndex = -1; beat.focus({ preventScroll: true }) }
      button.hidden = !on
    }
    if (!complete) progress = holding ? Math.min(1, progress + dt / fill) : Math.max(0, progress - dt / drain)
    if (!complete && progress >= 1) {
      complete = true; end()
      button.textContent = done; button.setAttribute('aria-disabled', 'true')   // stays focusable (disabled would drop focus)
      live.textContent = done
      onComplete?.()
    }
    const pct = Math.round(progress * 10) * 10                      // announce in 10% steps, not every frame
    if (pct !== said) { said = pct; bar.setAttribute('aria-valuenow', String(pct)) }
    return progress
  }
  button.hidden = true
  return { update, button, get progress() { return progress }, get holding() { return holding }, get complete() { return complete } }
}

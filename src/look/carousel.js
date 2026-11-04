// carousel (slice 2): pick one of N items, the reference's product selection made generic (any product, chapter or
// choice). HTML owns the controls and the words; GL draws the objects and the ink boxes.
//   controls  real buttons (prev / next, labelled), arrow keys while the carousel has focus, a horizontal swipe
//   a11y      an aria-live line announces "<label> 2 of 3: <name>"; the visible title (letters as spans for the
//             stagger) is aria-hidden, so screen readers get the name once, from the live line
//   motion    `pos` eases toward the index with the scroll's own rule (half the distance per 60 fps frame, frame-rate
//             independent); each title letter slides in with a stagger (the reference's TextCarouselShader idea, as
//             CSS on real text)
export function createCarousel(root, { items, label = 'item', onChange } = {}) {
  root.classList.add('carousel'); root.setAttribute('role', 'group'); root.setAttribute('aria-roledescription', 'carousel')
  root.setAttribute('aria-label', `${label}s`); root.tabIndex = -1
  root.innerHTML = `
    <button type="button" class="car-prev" aria-label="Previous ${label}">&#8592;</button>
    <h2 class="car-title" aria-hidden="true"></h2>
    <button type="button" class="car-next" aria-label="Next ${label}">&#8594;</button>
    <p class="sr-only" aria-live="polite"></p>`
  const $ = (s) => root.querySelector(s)
  const title = $('.car-title'), live = $('[aria-live]')
  let index = 0, pos = 0, last = performance.now()
  const reduce = matchMedia('(prefers-reduced-motion: reduce)')

  function show(i, dir = 0) {
    index = (i + items.length) % items.length
    const name = items[index].name
    // letters as spans for the stagger; the visible title is aria-hidden, the live line carries the words
    title.innerHTML = [...name].map((c, k) => `<span style="--i:${k};--d:${dir}">${c === ' ' ? '&nbsp;' : c}</span>`).join('')
    title.classList.remove('in'); void title.offsetWidth; title.classList.add('in')
    live.textContent = `${label[0].toUpperCase() + label.slice(1)} ${index + 1} of ${items.length}: ${name}`
    if (dir) onChange?.(index, dir)                     // user changes only, not the first show (callers may not be ready)
  }
  const step = (d) => show(index + d, d)
  $('.car-prev').addEventListener('click', () => step(-1))
  $('.car-next').addEventListener('click', () => step(1))
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { step(-1); e.preventDefault() }
    if (e.key === 'ArrowRight') { step(1); e.preventDefault() }
  })
  // swipe: a mostly horizontal drag of 50 px or more on the carousel's area. the pointer is captured, so only its own
  // up / cancel end it; v1 listened for ANY pointerup on the window, so after a cancelled touch (the browser taking
  // over a vertical scroll) a later tap anywhere changed the ink, even with the carousel inert (review of 7e5f3d4)
  let sx = null, sy = 0, pid = null
  const end = () => { sx = null; pid = null }
  root.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || root.closest('[inert]')) return
    sx = e.clientX; sy = e.clientY; pid = e.pointerId
    try { root.setPointerCapture(e.pointerId) } catch { /* synthetic events have no active pointer */ }
  })
  root.addEventListener('pointerup', (e) => {
    if (sx === null || e.pointerId !== pid) return end()
    const dx = e.clientX - sx, dy = e.clientY - sy; end()
    if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) step(dx < 0 ? 1 : -1)
  })
  root.addEventListener('pointercancel', end); root.addEventListener('lostpointercapture', end)
  show(0)
  return {
    get index() { return index },
    get pos() { return pos },
    show, step,
    // ease the row toward the index (wrapping: always the short way round); returns the eased position
    update(now = performance.now()) {
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now
      let d = index - pos; const n = items.length
      if (d > n / 2) pos += n; if (d < -n / 2) pos -= n; d = index - pos
      pos = reduce.matches ? index : pos + d * (1 - Math.pow(0.5, dt * 60 * 0.25))   // a quarter of the scroll's speed
      if (Math.abs(index - pos) < 1e-3) pos = index
      return pos
    },
  }
}

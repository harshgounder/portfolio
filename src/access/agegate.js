// age gate (slice 2): an accessible HTML dialog; the GL overlay draws its boxes in the comic style.
// modes per market: 'yesno' (a confirm button pair) or 'dob' (date of birth checked against legalAge).
// the research flagged a yes/no-only gate as weak for some markets (UNIQUENESS); DOB mode covers those.
export function createAgeGate({ mode = 'yesno', legalAge = 18, root = document.body, copy = {} } = {}) {
  const c = { title: 'Are you of legal age?', yes: 'Yes', no: 'No', dobLabel: 'Your date of birth', enter: 'Enter',
    denied: 'You need to be of legal drinking age to enter.', ...copy }
  const el = Object.assign(document.createElement('div'), { className: 'agegate' })
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'agegate-title')
  el.innerHTML = `
    <h2 id="agegate-title" class="agegate-title">${c.title}</h2>
    ${mode === 'dob' ? `
      <form class="agegate-dob" novalidate>
        <fieldset><legend>${c.dobLabel}</legend>
          <label>day <input class="box" name="d" inputmode="numeric" maxlength="2" size="2" required></label>
          <label>month <input class="box" name="m" inputmode="numeric" maxlength="2" size="2" required></label>
          <label>year <input class="box" name="y" inputmode="numeric" maxlength="4" size="4" required></label>
        </fieldset>
        <button class="box action" type="submit">${c.enter}</button>
      </form>` : `
      <div class="agegate-actions">
        <button class="box action" data-answer="yes">${c.yes}</button>
        <button class="box action" data-answer="no">${c.no}</button>
      </div>`}
    <p class="agegate-denied" role="alert" hidden>${c.denied}</p>`
  root.append(el)

  let resolve
  const passed = new Promise((r) => { resolve = r })
  const deny = () => { el.querySelector('.agegate-denied').hidden = false }
  // the caller moves focus into the content once it is no longer inert (see scenes/story.js)
  const pass = () => { el.hidden = true; resolve(true) }
  el.querySelectorAll('[data-answer]').forEach((b) => b.addEventListener('click', () => (b.dataset.answer === 'yes' ? pass() : deny())))
  el.querySelector('form')?.addEventListener('submit', (e) => {
    e.preventDefault()
    const f = new FormData(e.target), d = +f.get('d'), m = +f.get('m'), y = +f.get('y')
    // a full 4-digit year in a plausible range: new Date() maps 0-99 to 1900-1999, so '16' read as 1916
    // while the age maths used 16 (a 10-year-old passed; found in review 2026-10-11)
    const thisYear = new Date().getFullYear()
    if (!/^\d{4}$/.test(String(f.get('y')).trim()) || y < thisYear - 120 || y > thisYear) return deny()
    const born = new Date(y, m - 1, d)
    if (!y || born.getMonth() !== m - 1 || born.getDate() !== d) return deny()   // not a real date
    const now = new Date()
    const age = now.getFullYear() - y - (now < new Date(now.getFullYear(), m - 1, d) ? 1 : 0)
    age >= legalAge ? pass() : deny()
  })
  el.querySelector('.action, input')?.focus()
  return { el, passed, boxes: () => (el.hidden ? [] : [...el.querySelectorAll('.box')]), get open() { return !el.hidden } }
}

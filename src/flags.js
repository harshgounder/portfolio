// debug flags from the query string, e.g. ?scene=smoke&backend=webgpu&panel&preset=default&t=1.5
const q = new URLSearchParams(location.search)

export const flags = {
  scene: q.get('scene'),
  backend: q.get('backend') ?? 'webgl', // webgl | webgpu
  panel: q.has('panel'),
  preset: q.get('preset'),
  dpr: Number(q.get('dpr')) || Math.min(devicePixelRatio, 2),
  t: q.has('t') ? Number(q.get('t')) : null, // frozen time, for repeatable screenshots
  gate: q.get('gate'), // age gate mode: yesno | dob
  // quality tier (look/tiers.js): auto by default; a number fixes it, 'off' or an explicit ?dpr turns the controller off
  tier: q.get('tier') ?? (q.has('dpr') ? 'off' : 'auto'),
}

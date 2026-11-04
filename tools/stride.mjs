// measures the walk clip's ground speed: the root speed at which a planted foot stays still (no foot sliding)
// usage: node tools/stride.mjs   -> prints clip duration, forward axis, speed m/s, stride per cycle
import puppeteer from 'puppeteer-core'
import { createServer } from 'vite'
const server = await createServer({ root: new URL('..', import.meta.url).pathname, logLevel: 'error', server: { port: 0 } }); await server.listen()
const b = await puppeteer.launch({ executablePath: '/usr/bin/brave', headless: true, args: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] })
const p = await b.newPage(); await p.goto(`${server.resolvedUrls.local[0]}?scene=story`)
await p.waitForFunction(() => window.__lab?.ready && window.__world, { timeout: 30000 })
const r = await p.evaluate(() => {
  const w = window.__world, feet = []
  w.model.traverse((o) => { if (o.isBone && /(Left|Right)Foot$/.test(o.name)) feet.push(o) })
  const dur = w.clipDuration, N = 240, samples = []
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * dur * 2; w.setWalkTime(t); w.model.updateMatrixWorld(true)
    samples.push(feet.map((f) => { const v = f.getWorldPosition(f.position.clone()); return [v.x, v.y, v.z] }))
  }
  return { dur, samples }
})
await b.close(); await server.close()
// a planted foot is the lower one; while planted it slides backwards at -speed along the walk axis (in place clip)
const { dur, samples } = r, dt = (dur * 2) / (samples.length - 1)
for (const axis of [0, 2]) {
  const v = []
  for (let i = 1; i < samples.length; i++) {
    const low = samples[i][0][1] < samples[i][1][1] ? 0 : 1
    if (Math.abs(samples[i][low][1] - samples[i - 1][low][1]) < 0.002) v.push((samples[i][low][axis] - samples[i - 1][low][axis]) / dt)
  }
  v.sort((a, b) => a - b)
  console.log(`axis ${'xyz'[axis]}: planted-foot velocity median ${v[v.length >> 1]?.toFixed(3)} m/s over ${v.length} frames`)
}
console.log(`clip duration ${dur.toFixed(3)} s`)

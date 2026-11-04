import * as THREE from 'three/webgpu'
import {
  Fn, uniform, float, attribute, vec2, vec4, positionLocal, normalLocal, normalWorld, modelWorldMatrix,
  vec3, dot, fract, abs, floor, mod, mix, smoothstep, dFdx, dFdy, length, clamp, max, select, frontFacing,
} from 'three/tsl'

// same hatch look as look/hatch.js, written in TSL for WebGPURenderer (falls back to WebGL2 by itself).
// one difference: the outline is pushed out along the local normal by a width converted from pixels on
// the CPU each frame (uniform for the whole figure), where the GLSL version offsets in clip space per vertex.

// hash without sine (Dave Hoskins, MIT): the same as look/hatch.js (review #11)
const hash = Fn(([p]) => {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)).toVar()
  p3.addAssign(dot(p3, p3.yzx.add(33.33)))
  return fract(p3.x.add(p3.y).mul(p3.z))
})
const noise = Fn(([p]) => {
  const i = floor(p), f = fract(p)
  const u = f.mul(f).mul(float(3).sub(f.mul(2)))
  return mix(mix(hash(i), hash(i.add(vec2(1, 0))), u.x), mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), u.x), u.y)
})
// step with a one-pixel smooth edge
const aastep = Fn(([t, v]) => {
  const w = length(vec2(dFdx(v), dFdy(v))).mul(0.70710678)
  return smoothstep(t.sub(w), t.add(w), v)
})

export function createHatch() {
  const u = {
    time: uniform(0), ink: uniform(new THREE.Color()), mid: uniform(new THREE.Color()), paper: uniform(new THREE.Color()),
    lightDir: uniform(new THREE.Vector3()), lineAxis: uniform(new THREE.Vector3()), lineAlong: uniform(new THREE.Vector3()),
    boilFps: uniform(8), boilStates: uniform(4), lineTile: uniform(90), wobble: uniform(0), tooth: uniform(0),
    shadow: uniform(0), high: uniform(0), bounce: uniform(0), midWidth: uniform(0), stipple: uniform(0), dash: uniform(0),
    outlineLocal: uniform(0), ao: uniform(0.6),
  }

  const color = Fn(([mid, aoNode, posNode]) => {
    // line space: the baked hatchPos when the mesh has one (fixed on the surface, review #17, see hatch.js), else
    // the skinned position
    const posW = modelWorldMatrix.mul(vec4(posNode, 0)).xyz            // object-attached, world units
    const light = dot(normalWorld, u.lightDir).sub(aoNode.mul(u.ao))   // baked occlusion pushes toward shadow
    const state = mod(floor(u.time.mul(u.boilFps)), u.boilStates)
    const a = dot(posW, u.lineAlong).mul(u.lineTile)
    const s = dot(posW, u.lineAxis).mul(u.lineTile).add(noise(vec2(a.mul(0.15), state.mul(13.7))).sub(0.5).mul(u.wobble))
    const f = abs(fract(s).sub(0.5)).mul(2)
    const lit = aastep(u.shadow, light.sub(u.tooth.mul(float(1).sub(f))))
    const bounce = float(1).sub(aastep(u.bounce, light))
    const tone = clamp(u.high.sub(light).div(u.high.sub(u.shadow)), 0, 1)
    const dash = aastep(u.stipple.mul(float(1).sub(tone)), noise(vec2(a.mul(u.dash), floor(s).mul(7.3).add(state))))
    const line = float(1).sub(aastep(tone.mul(u.midWidth), f)).mul(dash)
    const high = aastep(u.high, light.add(f.sub(0.5).mul(u.tooth).mul(0.25)))
    const ink = max(float(1).sub(lit).mul(float(1).sub(bounce)), line.mul(lit))
    return select(frontFacing, mix(mix(mid, u.paper, high), u.ink, ink), u.ink)
  })

  const fill = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide })
  fill.colorNode = color(u.mid, float(0), positionLocal)
  const variants = []
  // a fill material for one mesh: its own middle colour (param key) and the baked AO when the mesh has `_ao`
  function fillFor({ midKey = 'mid', ao = false, hatchPos = false } = {}) {
    const mid = uniform(new THREE.Color())
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide })
    m.colorNode = color(mid, ao ? attribute('_ao', 'float') : float(0), hatchPos ? attribute('hatchPos', 'vec3') : positionLocal)
    variants.push([mid, midKey]); return m
  }
  const outline = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide })
  outline.colorNode = u.ink
  outline.positionNode = positionLocal.add(normalLocal.mul(u.outlineLocal))

  // outline width = params.outline in CSS px x the pixel ratio, converted to local units per draw from the
  // camera actually drawing and the height of the target it draws into (the canvas or an inset's own target).
  // v1 did this once per frame from the canvas size and the story camera of the moment (review #6).
  // outlineLocal is an object-group uniform, so a value set here is read for this draw
  const v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Vector3(), px = new THREE.Vector2()
  let outlinePx = 0
  function bindOutline(mesh) {
    mesh.onBeforeRender = (renderer, scene, camera) => {
      const rt = renderer.getRenderTarget()
      const h = rt ? rt.height : renderer.getDrawingBufferSize(px).y
      mesh.getWorldPosition(v); mesh.getWorldScale(s); camera.getWorldPosition(c)
      const worldPerPx = (2 * c.distanceTo(v) * Math.tan((camera.fov * Math.PI) / 360)) / h
      // skinned vertices come out of TSL skinning already in world-scaled units (measured 2026-10-10 on Xbot,
      // armature scale 0.01): dividing by the world scale made the hull 100x too fat
      u.outlineLocal.value = (outlinePx * renderer.getPixelRatio() * worldPerPx) / (mesh.isSkinnedMesh ? 1 : s.x)
    }
  }

  // copy params into uniforms; call once per frame
  function update(p, t) {
    u.time.value = t
    u.ink.value.set(p.ink); u.mid.value.set(p.mid); u.paper.value.set(p.paper)
    u.lightDir.value.set(Math.cos(p.lightEl) * Math.sin(p.lightAz), Math.sin(p.lightEl), Math.cos(p.lightEl) * Math.cos(p.lightAz))
    u.lineAxis.value.set(Math.cos(p.lineAngle), Math.sin(p.lineAngle), p.lineTilt).normalize()
    u.lineAlong.value.set(-Math.sin(p.lineAngle), Math.cos(p.lineAngle), 0).normalize()
    u.ao.value = p.ao ?? 0
    for (const [mid, key] of variants) mid.value.set(p[key] ?? p.mid)
    for (const k of ['boilFps', 'boilStates', 'lineTile', 'wobble', 'tooth', 'shadow', 'high', 'bounce', 'midWidth', 'stipple', 'dash']) u[k].value = p[k]
    outlinePx = p.outline
  }

  return { fill, fillFor, outline, update, bindOutline }
}

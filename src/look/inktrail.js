import * as THREE from 'three'

// ink trail (slice 2): a stamp brush, our own. the pointer path is stamped as a capsule into a half-resolution
// ping-pong buffer every frame; ink bleeds a little into its neighbours and fades. the panel compositor
// thresholds it into crisp, boiling woodcut edges. cheap enough for every GPU tier (Santioni used a fluid sim
// and switched it off on tier 0).

const sim = /* glsl */ `
uniform sampler2D tPrev;
uniform vec2 uRes, uA, uB;           // buffer px; segment from the last to the current pointer (buffer px)
uniform float uRadius, uDecay, uOn, uBleed;
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0); return length(pa - ba * h); }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes, px = 1.0 / uRes;
  float c = texture2D(tPrev, uv).r;
  float n = 0.25 * (texture2D(tPrev, uv + vec2(px.x, 0.0)).r + texture2D(tPrev, uv - vec2(px.x, 0.0)).r
                  + texture2D(tPrev, uv + vec2(0.0, px.y)).r + texture2D(tPrev, uv - vec2(0.0, px.y)).r);
  float v = mix(c, n, uBleed) * uDecay;                                 // bleed + fade
  float d = sdSeg(gl_FragCoord.xy, uA, uB);
  v = max(v, (1.0 - smoothstep(uRadius * 0.55, uRadius, d)) * uOn);   // stamp
  gl_FragColor = vec4(v, 0.0, 0.0, 1.0);
}`

export function createInkTrail(renderer, { scale = 0.5, life = 2.5 } = {}) {
  const size = new THREE.Vector2()
  const make = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })
  let a = make(), b = make()
  const material = new THREE.ShaderMaterial({
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: sim,
    uniforms: { tPrev: { value: null }, uRes: { value: new THREE.Vector2() }, uA: { value: new THREE.Vector2() }, uB: { value: new THREE.Vector2() },
      uRadius: { value: 8 }, uDecay: { value: 0.99 }, uOn: { value: 0 }, uBleed: { value: 0.12 } },
    depthTest: false, depthWrite: false,
  })
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
  const quad = new THREE.Mesh(geo, material); quad.frustumCulled = false
  const scene = new THREE.Scene(); scene.add(quad)
  const cam = new THREE.Camera()

  const ptr = { x: 0, y: 0, px: 0, py: 0, moved: false, seen: false }
  addEventListener('pointermove', (e) => {
    if (!ptr.seen) { ptr.px = e.clientX; ptr.py = e.clientY; ptr.seen = true }
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.moved = true
  })
  let last = performance.now()

  // one sim step per frame; returns the texture to composite (red channel = ink amount)
  function update(enabled = true) {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now
    renderer.getDrawingBufferSize(size)
    const w = Math.max(1, Math.round(size.x * scale)), h = Math.max(1, Math.round(size.y * scale))
    if (a.width !== w || a.height !== h) { a.setSize(w, h); b.setSize(w, h) }
    const k = (w / innerWidth)                                      // CSS px -> buffer px
    const u = material.uniforms
    u.tPrev.value = a.texture; u.uRes.value.set(w, h)
    u.uA.value.set(ptr.px * k, h - ptr.py * k); u.uB.value.set(ptr.x * k, h - ptr.y * k)
    const speed = Math.hypot(ptr.x - ptr.px, ptr.y - ptr.py) / Math.max(dt, 1e-3)    // CSS px / s
    u.uRadius.value = k * Math.max(5, 16 - speed * 0.004)            // fast = thinner, like a brush
    u.uDecay.value = Math.pow(0.5, dt / life)                         // ink reaches the 0.5 threshold (disappears) after `life` s
    // bleed is diffusion: its spread grows with time, so the per-step share scales with dt (0.12 per 60 fps frame;
    // v1 used 0.12 per frame, twice the spread at 120 Hz, review #10). capped well inside the stable range (< 1)
    u.uBleed.value = Math.min(0.6, 0.12 * dt * 60)
    u.uOn.value = enabled && ptr.moved ? 1 : 0
    renderer.setRenderTarget(b); renderer.render(scene, cam); renderer.setRenderTarget(null)
    ;[a, b] = [b, a]
    ptr.px = ptr.x; ptr.py = ptr.y; ptr.moved = false
    return a.texture
  }
  return { update }
}

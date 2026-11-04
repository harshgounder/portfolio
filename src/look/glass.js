import * as THREE from 'three'

// glass in the woodcut look (slice 2): a bottle drawn the way an engraver draws glass, with real refraction.
//   shell       only its highlight streaks (paper, boiling) and the ink outline hull are drawn; everything else
//               is discarded, so what is inside (the liquid) and behind (the ground) shows through
//   refraction  a second pass writes the bottle's screen-space bend (-normal.xy: a convex bottle flips what is
//               behind it) and a mask into a screen-size target; the compositor (look/panel.js envAt) looks the
//               environment up at the bent position, so the ground marks really bend through the glass
//   liquid      the ink inside: an ordinary hatch fill in the ink's own colour (the beat's one accent)
// all geometry in metres, built in code (lathe profiles).

// outer profile of an ink bottle, from the base centre up to the lip: [radius, y]
export function bottleProfile({ h = 0.3, r = 0.1 } = {}) {
  const p = [[0, 0], [r * 0.9, 0], [r, 0.015], [r, h * 0.5], [r * 0.93, h * 0.6], [r * 0.6, h * 0.7], [r * 0.38, h * 0.76],
    [r * 0.36, h * 0.88], [r * 0.44, h * 0.9], [r * 0.44, h * 0.94], [r * 0.32, h * 0.94]]
  return p.map(([x, y]) => new THREE.Vector2(x, y))
}

const shellVertex = /* glsl */ `
varying vec3 vN; varying vec3 vPosO;
void main() { vN = normalize(normalMatrix * normal); vPosO = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
// two vertical highlight streaks where the view-space normal faces the light side, edges boiling with the lines
const shellFragment = /* glsl */ `
uniform vec3 uPaper; uniform float uTime, uBoilFps; uniform vec2 uStreak; // centre of the main streak in normal.x, width
varying vec3 vN; varying vec3 vPosO;
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  if (!gl_FrontFacing) discard;
  float state = mod(floor(uTime * uBoilFps), 4096.0);
  float wob = (hash(vec2(floor(vPosO.y * 60.0), state)) - 0.5) * 0.04;            // a hand-cut edge, re-cut per boil
  float a = smoothstep(uStreak.y, 0.0, abs(vN.x - uStreak.x + wob));                 // main streak
  float b = smoothstep(uStreak.y * 0.4, 0.0, abs(vN.x - (uStreak.x + 0.55) + wob));  // a thin second one
  float m = max(a, b) * step(0.25, vN.z);                                           // not on the turning edge
  if (m < 0.5) discard;
  gl_FragColor = vec4(uPaper, 1.0);
  #include <colorspace_fragment>
}`
const refractVertex = /* glsl */ `
varying vec3 vN; void main() { vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const refractFragment = /* glsl */ `
varying vec3 vN; uniform float uStrength;
void main() {
  if (!gl_FrontFacing) discard;
  // bend grows toward the silhouette (thicker glass along the view ray); flipped like a lens
  vec2 off = -vN.xy * uStrength * (0.35 + 0.65 * (1.0 - vN.z));
  gl_FragColor = vec4(0.5 + 0.5 * clamp(off, -1.0, 1.0), 1.0, 1.0);
}`

// one bottle: { group, shell, liquid, cork, refract (mesh for the refraction pass) }. `hatch` = createHatch()
export function createBottle(hatch, { inkKey = 'ink', fill = 0.55, h = 0.3, r = 0.1, segments = 64 } = {}) {
  const prof = bottleProfile({ h, r })
  const shellGeo = new THREE.LatheGeometry(prof, segments)
  const shared = { uPaper: { value: new THREE.Color() }, uTime: { value: 0 }, uBoilFps: { value: 8 }, uStreak: { value: new THREE.Vector2(-0.45, 0.12) } }
  const shell = new THREE.Mesh(shellGeo, new THREE.ShaderMaterial({ uniforms: shared, vertexShader: shellVertex, fragmentShader: shellFragment }))
  const hull = new THREE.Mesh(shellGeo, hatch.outline); hatch.bindOutline(hull)
  // the ink: inside the wall, a flat top at `fill` of the body height
  const ri = r * 0.9, top = h * 0.5 * fill * 1.6
  const liquidGeo = new THREE.LatheGeometry([[0, 0.012], [ri, 0.014], [ri, top], [0, top]].map(([x, y]) => new THREE.Vector2(x, y)), segments)
  const liquid = new THREE.Mesh(liquidGeo, hatch.fillFor({ midKey: inkKey }))
  const corkGeo = new THREE.CylinderGeometry(r * 0.3, r * 0.27, h * 0.14, 24).translate(0, h * 0.97, 0)
  const cork = new THREE.Mesh(corkGeo, hatch.fillFor({ midKey: 'mid' }))
  const corkHull = new THREE.Mesh(corkGeo, hatch.outline); hatch.bindOutline(corkHull)
  const refract = new THREE.Mesh(shellGeo, new THREE.ShaderMaterial({ uniforms: { uStrength: { value: 0.9 } }, vertexShader: refractVertex, fragmentShader: refractFragment }))
  refract.layers.set(1)                                                // drawn only in the refraction pass
  // the inverted-hull outline only works on opaque things: through the clear front of the glass its back faces
  // (ink) filled the whole bottle. an invisible depth-only front, drawn after the liquid and before the hull, hides
  // them; the liquid is already drawn by then, so it stays visible
  const depth = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.FrontSide }))
  liquid.renderOrder = 0; cork.renderOrder = 0; corkHull.renderOrder = 0; depth.renderOrder = 1; shell.renderOrder = 2; hull.renderOrder = 3
  const group = new THREE.Group(); group.add(liquid, depth, shell, hull, cork, corkHull, refract)
  return {
    group, liquid, refract,
    update(p, t) { shared.uPaper.value.set(p.paper); shared.uTime.value = t; shared.uBoilFps.value = p.boilFps ?? 8 },
  }
}

// the refraction pass for a scene: renders layer 1 (refraction meshes) into a screen-size target, cleared to "no
// bend" (0.5, 0.5, mask 0). returns the texture for the compositor (`p.refract`)
export function createRefraction(renderer) {
  const size = new THREE.Vector2(), target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
  const clear = new THREE.Color(0.5, 0.5, 0)
  return {
    render(scene, camera) {
      renderer.getDrawingBufferSize(size)
      if (target.width !== size.x || target.height !== size.y) target.setSize(size.x, size.y)
      const prevMask = camera.layers.mask, prevColor = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha()
      camera.layers.set(1)
      // alpha 1: with premultiplied alpha (the renderer default) a clear at alpha 0 became (0, 0, 0, 0), not "no bend"
      // (harmless while texels map 1:1 and the mask is 0 there, wrong once filtered; review of 7e5f3d4)
      renderer.setRenderTarget(target); renderer.setClearColor(clear, 1); renderer.clear(); renderer.render(scene, camera)
      renderer.setRenderTarget(null); renderer.setClearColor(prevColor, prevAlpha)
      camera.layers.mask = prevMask
      return target.texture
    },
    // a full-res half-float target is ~70 MB at 3024x1964: shrink it while its beat is off screen
    release() { if (target.width > 1) target.setSize(1, 1) },
  }
}

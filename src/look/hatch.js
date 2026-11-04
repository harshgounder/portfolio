import * as THREE from 'three'

// hatch look (GLSL, WebGLRenderer). method decoded from santionispirits.com (research/decode-01),
// written from scratch: one family of parallel lines in object space, thresholded against N.L.
//   shadow:  solid ink, with tapered "teeth" where line centres reach past the terminator
//   middle:  spot colour (tan) under lines whose width grows toward the shadow, dashed in the light
//   high:    paper
// lineTile = lines per world unit (metre), measured along the object's own axes
//   boil:    the line wobble is re-seeded boilFps times a second, cycling through boilStates states

const vertex = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform float uOutline;   // device px (CSS px x pixel ratio); 0 = fill pass
uniform vec2 uResolution; // size of the target being drawn, device px (set per draw, bindOutline)
varying vec3 vNormalW;
varying vec3 vPosO;
#ifdef USE_AO
attribute float _ao;      // baked in Blender (art/character/dress.py), 0 open .. 1 occluded
varying float vAo;
#endif
#ifdef USE_HATCHPOS
attribute vec3 hatchPos;  // where the lines are drawn: the walk's mean skinned pose (scenes/hatch.js bakeHatchPos)
#endif
#ifdef USE_CRUMBLE
attribute vec3 pivot;     // chunk centre (look/crumble.js)
attribute float rank;     // 0..1 per chunk: its own timing and spin
attribute float inner;    // 1 on the fresh crack faces
varying float vInner;
uniform float uCrumble;   // progress 0..1 (scroll-scrubbed)
uniform vec4 uCrumbleShape; // x spread (m), y lift (m), z spin (rad), w stagger 0..1 (top chunks go first)
uniform vec2 uCrumbleY;   // lowest and highest chunk centre (object y), to rank chunks by height
uniform vec4 uPointer;    // object-space point + push radius (m); w = 0: off
uniform float uTime, uBoilFps;
vec3 hash31(float p) { vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
mat3 rotAxis(vec3 a, float t) { float s = sin(t), c = cos(t), o = 1.0 - c;
  return mat3(o*a.x*a.x + c, o*a.x*a.y + a.z*s, o*a.z*a.x - a.y*s, o*a.x*a.y - a.z*s, o*a.y*a.y + c, o*a.y*a.z + a.x*s,
              o*a.z*a.x + a.y*s, o*a.y*a.z - a.x*s, o*a.z*a.z + c); }
#endif

void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #ifdef USE_CRUMBLE
    // each chunk: a delay from its height (top first) and rank, then it lifts, drifts outward and turns about its
    // own hashed axis; a small turn re-picked at the boil rate keeps it hand-drawn; the pointer shoves near chunks
    float h = clamp((pivot.y - uCrumbleY.x) / max(1e-3, uCrumbleY.y - uCrumbleY.x), 0.0, 1.0);
    float delay = uCrumbleShape.w * (0.75 * (1.0 - h) + 0.25 * rank);
    // the lowest chunks barely move: stumps and bases stay standing, so it reads as a ruin, not a cloud of rocks
    // each chunk moves from its own delay until progress 1, so the motion lasts the whole beat (a fixed-length ramp
    // finished every chunk by ~0.6 and the last third of the scroll was still)
    float e = smoothstep(0.0, 1.0, clamp((uCrumble - delay) / max(1e-3, 1.0 - delay), 0.0, 1.0)) * (0.08 + 0.92 * smoothstep(0.04, 0.45, h));
    vec3 axis = normalize(hash31(rank * 97.0 + pivot.x * 13.0) * 2.0 - 1.0 + 1e-4);
    float boil = hash31(floor(uTime * uBoilFps) + rank * 31.0).x - 0.5;
    mat3 R = rotAxis(axis, e * uCrumbleShape.z * (0.4 + rank) + 0.05 * e * boil);
    vec3 away = normalize(vec3(pivot.x, 0.0, pivot.z) + vec3(1e-4, 0.0, 0.0));
    transformed = R * (transformed - pivot) + pivot + away * uCrumbleShape.x * e * (0.5 + rank)
                + vec3(0.0, uCrumbleShape.y * e * e * (0.3 + h), 0.0);
    if (uPointer.w > 0.0) {
      vec3 d = pivot - uPointer.xyz; float f = 1.0 - smoothstep(0.0, uPointer.w, length(d));
      transformed += normalize(d + 1e-4) * f * f * 0.18;
    }
    objectNormal = R * objectNormal;
    vInner = inner;
  #endif
  // object-attached line space, in world units (models ship in cm or m). with hatchPos the lines are fixed on the
  // surface and move with a limb: from the skinned position (v1, the fallback) the pattern slid a median 0.18 of a
  // line period per 60 fps frame while walking (p90 0.61, lab/tools/swim-probe.mjs, review #17). the raw position
  // was tried first: not in world units for every mesh (the hat's skin keeps its scale, 4.2x) and the A-pose rest
  // packed the lines where the lowered arm turns away
  #ifdef USE_HATCHPOS
    vPosO = mat3(modelMatrix) * hatchPos;
  #elif defined(USE_CRUMBLE)
    vPosO = mat3(modelMatrix) * position;      // unskinned, in metres: the lines stay on each chunk as it turns
  #else
    vPosO = mat3(modelMatrix) * transformed;
  #endif
  #ifdef USE_AO
    vAo = _ao;
  #endif
  vNormalW = normalize(mat3(modelMatrix) * objectNormal);
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  #ifdef OUTLINE
    // inverted hull: push the back faces out along the screen-space normal by a fixed pixel width
    vec2 n = (projectionMatrix * vec4(normalMatrix * objectNormal, 0.0)).xy * uResolution;
    clip.xy += normalize(n + 1e-6) / uResolution * 2.0 * uOutline * clip.w;
  #endif
  gl_Position = clip;
}
`

const fragment = /* glsl */ `
uniform vec3 uInk, uMid, uPaper, uLightDir, uLineAxis, uLineAlong;
uniform float uAo;
#ifdef USE_AO
varying float vAo;
#endif
#ifdef USE_CRUMBLE
varying float vInner;
#endif
uniform float uTime, uBoilFps, uBoilStates, uLineTile, uWobble, uTooth, uShadow, uHigh, uBounce, uMidWidth, uStipple, uDash;
varying vec3 vNormalW;
varying vec3 vPosO;

// hash without sine (Dave Hoskins, MIT, shadertoy 4djSRW): sin()-based hashes lose precision at large arguments
// and differ between GPUs (review #11)
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
// step with a one-pixel smooth edge, so every edge stays crisp at any scale
float aastep(float t, float v) {
  float w = length(vec2(dFdx(v), dFdy(v))) * 0.70710678;
  return smoothstep(t - w, t + w, v);
}

void main() {
  #ifdef OUTLINE
    gl_FragColor = vec4(uInk, 1.0);
  #else
  if (!gl_FrontFacing) { gl_FragColor = vec4(uInk, 1.0); return; }

  float light = dot(normalize(vNormalW), uLightDir);          // -1..1
  #ifdef USE_CRUMBLE
    light -= vInner * 0.6;                                     // fresh crack faces sit darker: hatched, not paper
  #endif
  #ifdef USE_AO
    light -= vAo * uAo;                                        // baked occlusion pushes toward shadow
  #endif
  float state = mod(floor(uTime * uBoilFps), uBoilStates);     // boil state
  float a = dot(vPosO, uLineAlong) * uLineTile;                // along the lines
  float s = dot(vPosO, uLineAxis) * uLineTile;                 // across the lines (1 = one period)
  s += (noise(vec2(a * 0.15, state * 13.7)) - 0.5) * uWobble;  // hand wobble, re-seeded per state
  float f = abs(fract(s) - 0.5) * 2.0;                         // 0 on a line centre, 1 mid-gap

  // shadow with tapered teeth: line centres carry the ink up to uTooth past the terminator
  float lit = aastep(uShadow, light - uTooth * (1.0 - f));
  // deepest shadow gets a rim of spot colour (light bouncing back)
  float bounce = 1.0 - aastep(uBounce, light);

  // middle-band hatch: width grows toward the shadow, lines break into dashes toward the light
  float tone = clamp((uHigh - light) / (uHigh - uShadow), 0.0, 1.0); // 1 at terminator, 0 at high
  float dash = aastep(uStipple * (1.0 - tone), noise(vec2(a * uDash, floor(s) * 7.3 + state)));
  float line = (1.0 - aastep(tone * uMidWidth, f)) * dash;

  float high = aastep(uHigh, light + (f - 0.5) * uTooth * 0.25);
  vec3 col = mix(uMid, uPaper, high);
  float ink = max((1.0 - lit) * (1.0 - bounce), line * lit);
  gl_FragColor = vec4(mix(col, uInk, ink), 1.0);
  #endif
  #include <colorspace_fragment>
}
`

export const hatchParams = {
  lineTile: 90, lineAngle: 1.3, lineTilt: 0.2, wobble: 0.35, tooth: 0.25,
  shadow: 0.35, high: 0.75, bounce: -0.85, midWidth: 0.55, stipple: 0.8, dash: 0.6,
  boilFps: 8, boilStates: 4,
  outline: 4.4,
  lightAz: -1.3, lightEl: 0.4,
  ink: '#151515', mid: '#b09c76', skin: '#ffffff', paper: '#ffffff', ao: 0.6,
}

export const hatchRanges = {
  lineTile: { min: 10, max: 300 }, lineAngle: { min: -3.14, max: 3.14 }, lineTilt: { min: -2, max: 2 },
  wobble: { min: 0, max: 1.5 }, tooth: { min: 0, max: 1 }, shadow: { min: -1, max: 1 }, high: { min: -1, max: 1 },
  bounce: { min: -1, max: 0 }, midWidth: { min: 0, max: 1 }, stipple: { min: 0, max: 1 }, dash: { min: 0, max: 3 },
  boilFps: { min: 0, max: 24, step: 1 }, ao: { min: 0, max: 2 }, boilStates: { min: 1, max: 8, step: 1 }, outline: { min: 0, max: 12 },
  lightAz: { min: -3.14, max: 3.14 }, lightEl: { min: -1.5, max: 1.5 },
}

export function createHatch() {
  const uniforms = {
    uTime: { value: 0 }, uResolution: { value: new THREE.Vector2(1, 1) }, uOutline: { value: 0 },
    uInk: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uPaper: { value: new THREE.Color() },
    uLightDir: { value: new THREE.Vector3() }, uLineAxis: { value: new THREE.Vector3() }, uLineAlong: { value: new THREE.Vector3() },
    uAo: { value: 0.6 }, uBoilFps: { value: 8 }, uBoilStates: { value: 4 }, uLineTile: { value: 90 }, uWobble: { value: 0 }, uTooth: { value: 0 },
    uShadow: { value: 0 }, uHigh: { value: 0 }, uBounce: { value: 0 }, uMidWidth: { value: 0 }, uStipple: { value: 0 }, uDash: { value: 0 },
  }
  const fill = new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment, side: THREE.DoubleSide })
  const outline = new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment, side: THREE.BackSide, defines: { OUTLINE: '' } })
  outline.uniforms = { ...uniforms, uOutline: { value: 0 } } // own width, shared everything else

  // a fill material for one mesh: its own middle colour (param key) and the baked AO when the mesh has `_ao`
  const variants = [], crumbleOutlines = []
  function fillFor({ midKey = 'mid', ao = false, hatchPos = false } = {}) {
    const m = new THREE.ShaderMaterial({ uniforms: { ...uniforms, uMid: { value: new THREE.Color() } }, vertexShader: vertex,
      fragmentShader: fragment, side: THREE.DoubleSide, defines: { ...(ao ? { USE_AO: '' } : {}), ...(hatchPos ? { USE_HATCHPOS: '' } : {}) } })
    variants.push([m, midKey]); return m
  }

  // outline width = params.outline in CSS px x the pixel ratio, against the size of the target this draw goes
  // to (the canvas, or an inset's own target). v1 used the canvas size and drawing-buffer px from update(), so
  // the hull was half as thick at dpr 2 and wrong in every inset (review #6). attach to each hull mesh: three.js
  // calls onBeforeRender before it picks the program, so the values upload for this draw
  let outlinePx = 0
  const px = new THREE.Vector2()
  function bindOutline(mesh) {
    mesh.onBeforeRender = (renderer, scene, camera, geometry, material) => {
      const rt = renderer.getRenderTarget()
      if (rt) px.set(rt.width, rt.height); else renderer.getDrawingBufferSize(px)
      uniforms.uResolution.value.copy(px)
      outline.uniforms.uOutline.value = outlinePx * renderer.getPixelRatio()
      material.uniformsNeedUpdate = true                               // the hull's own material (main or a crumble's)
    }
  }

  // copy params into uniforms; call once per frame
  function update(p, t) {
    const u = uniforms
    u.uTime.value = t
    u.uInk.value.set(p.ink); u.uMid.value.set(p.mid); u.uPaper.value.set(p.paper)
    u.uLightDir.value.set(Math.cos(p.lightEl) * Math.sin(p.lightAz), Math.sin(p.lightEl), Math.cos(p.lightEl) * Math.cos(p.lightAz))
    u.uLineAxis.value.set(Math.cos(p.lineAngle), Math.sin(p.lineAngle), p.lineTilt).normalize()
    u.uLineAlong.value.set(-Math.sin(p.lineAngle), Math.cos(p.lineAngle), 0).normalize()
    for (const [k, name] of [['boilFps', 'uBoilFps'], ['boilStates', 'uBoilStates'], ['lineTile', 'uLineTile'], ['wobble', 'uWobble'], ['tooth', 'uTooth'],
      ['shadow', 'uShadow'], ['high', 'uHigh'], ['bounce', 'uBounce'], ['midWidth', 'uMidWidth'], ['stipple', 'uStipple'], ['dash', 'uDash']]) u[name].value = p[k]
    outlinePx = p.outline
    u.uAo.value = p.ao ?? 0
    for (const [m, key] of variants) m.uniforms.uMid.value.set(p[key] ?? p.mid)
  }

  // a crumble (look/crumble.js): its own fill + outline pair sharing one set of crumble uniforms, so the outline
  // hull moves with the chunks. set `uniforms.uCrumble.value` (0..1) and friends per frame
  function crumbleMaterials({ midKey = 'mid' } = {}) {
    const cu = { uCrumble: { value: 0 }, uCrumbleShape: { value: new THREE.Vector4(0.6, 1.2, 1.6, 0.6) },
      uCrumbleY: { value: new THREE.Vector2(0, 1) }, uPointer: { value: new THREE.Vector4() } }
    const fillM = fillFor({ midKey }); Object.assign(fillM.uniforms, cu); fillM.defines.USE_CRUMBLE = ''
    const outM = new THREE.ShaderMaterial({ uniforms: { ...uniforms, ...cu }, vertexShader: vertex, fragmentShader: fragment,
      side: THREE.BackSide, defines: { OUTLINE: '', USE_CRUMBLE: '' } })
    outM.uniforms.uOutline = outline.uniforms.uOutline              // same width (and bindOutline's per-draw value)
    crumbleOutlines.push(outM)
    return { fill: fillM, outline: outM, uniforms: cu }
  }

  return { fill, fillFor, outline, update, bindOutline, crumbleMaterials }
}

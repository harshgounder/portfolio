import * as THREE from 'three'

// comic panel compositor (GLSL, our own). the 3D scene renders into a target; one full-screen pass then draws:
//   panel:  the scene shows inside a rectangle; outside is paper
//   ink:    rough strokes around the panel, caption boxes and the cursor badge; the stroke weight wobbles along
//           its length and the line drifts in and out, re-drawn boilFps times a second (art bible rules 6 + 8)
//   paper:  blue-noise grain multiplied over everything, scrolled with the page (art bible rule 1)
// boxes come from DOM elements (getBoundingClientRect), so HTML owns layout + text and GL owns the ink.

const MAX_BOXES = 6

const fragment = /* glsl */ `
uniform sampler2D tScene, tBlue, tTrail, tMap;
uniform float uTrail;                // 1 = composite the ink trail on this panel's ground
uniform float uMap, uFigure;         // map sheet on the ground (look/mapsheet.js); 0 = hide the 3D figure
uniform sampler2D tTitle, tRefract;
uniform float uRefract, uRefractPx;   // 1 = bend the environment by tRefract (glass), max offset in CSS px
uniform float uTitle;                // display titles drawn in GL (look/titlesheet.js), paper on the panel's ground
uniform vec2 uRes;
uniform float uDpr, uTime, uBoilFps, uScrollY, uGrain;
uniform vec3 uInk, uPaper, uSky;
uniform float uFit;                  // 1 = the 3D render fills this panel (insets), 0 = screen-aligned
uniform int uMode;                   // 0 = one panel (scissored), 1 = overlay boxes + badge, 2 = paper grain (multiply)
uniform vec4 uPanel;                 // x, y, w, h in device px, y from the top
uniform vec2 uPanelStroke;           // weight px, drift px
uniform vec4 uBoxes[${MAX_BOXES}];
uniform int uBoxCount;
uniform vec2 uBoxStroke;
uniform vec4 uBadge;                 // x, y (device px from top), radius, visible 0/1
uniform float uBadgeFill;            // 0..1: ink level rising inside the badge (hold progress)
uniform float uEnv, uHorizon, uFogAmp, uFogScale, uFogPeak; // environment: on, horizon (0 top .. 1 bottom of panel), fog edge
uniform float uBillow;               // 0 = soft fog edge, 1 = cumulus: rounded tops, pinched valleys (billow noise)
uniform vec4 uGround;                // engraved marks on the sky/ground: x = type (0 none, 1 gouge, 2 wood grain, 3 dry brush),
                                     // y = amount 0..1, z = tone for gouges (0 paper .. 1 ink), w = seed
uniform vec3 uShadow;                // cast shadow centre x, y (device px from top), half width px
varying vec2 vUv;

// hash without sine (Dave Hoskins, MIT, shadertoy 4djSRW): sin()-based hashes lose precision at large arguments
// and differ between GPUs (review #11)
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { return 0.5 * noise(p) + 0.25 * noise(p * 2.03 + 7.0) + 0.125 * noise(p * 4.01 + 13.0); }
// engraved ground marks (measured from the reference frames, 2026-10-11, art/QUALITY-AUDIT.md):
// 1 gouge: dense vertical cuts every 6 px that wobble, thicken with tone and break into dashes in the light,
//   fusing into solid ink as tone -> 1 (the night transition)
// 2 wood grain: sparse long knife strokes, slightly diagonal, 2-6 px, tapered, irregular spacing (colour grounds)
// 3 dry brush: horizontal drags a little darker than a charcoal sky (title sky)
// returns ink coverage 0..1 (types 1, 2) or a darkening factor (type 3)
float gouge(vec2 q, float tone, float state, float seed) {      // q in CSS px
  float period = 6.0, col = floor(q.x / period);
  float wob = 1.2 * (noise(vec2(col * 0.37 + seed, q.y / 90.0 + state * 0.13)) - 0.5);
  float d = abs(fract(q.x / period + wob / period) - 0.5) * period;            // px from the cut's centre
  float t = clamp(tone + 0.35 * (noise(vec2(col * 1.7 + seed, q.y / 60.0)) - 0.5), 0.0, 1.0);
  float w = period * t * 1.15;                                                // full width at the cut
  float dash = step(0.22 * (1.0 - t), noise(vec2(col * 3.1 + seed, q.y / 14.0 + state * 0.5)));
  return step(d, w * 0.5) * dash;           // hard edge: near-vertical cuts AA'd on a 6 px period read grey (7.7%)
}
float woodgrain(vec2 q, float state, float seed) {
  float a = 0.32;                                                            // ~18 deg off vertical
  vec2 r = vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));
  float u = r.x + 38.0 * (fbm(vec2(r.y / 420.0, seed)) - 0.5) * 2.0;         // gentle sway along the stroke
  float spacing = 95.0, c = floor(u / spacing);
  float off = (0.2 + 0.6 * hash(vec2(c, seed))) * spacing;
  float len = 0.5 + 0.5 * noise(vec2(c * 2.3 + seed, r.y / 260.0));         // strokes start and stop
  float w = (2.0 + 4.5 * hash(vec2(c + 9.0, seed))) * smoothstep(0.35, 0.75, len);
  float d = abs(u - c * spacing - off);
  float wob = 0.6 * (noise(vec2(c, state)) - 0.5);
  return (1.0 - smoothstep(w * 0.5 - 0.7, w * 0.5 + 0.7, d + wob)) * step(0.42, len);
}
float drybrush(vec2 q, float state, float seed) {
  float v = q.y + 26.0 * (fbm(vec2(q.x / 380.0, seed)) - 0.5) * 2.0;
  float band = noise(vec2(q.x / 210.0 + seed, v / 7.0)) * noise(vec2(q.x / 60.0, v / 2.5 + seed));
  return smoothstep(0.32, 0.55, band) * (0.6 + 0.4 * noise(vec2(q.x / 500.0, state * 0.1)));
}

// cumulus edge: the silhouette of round puffs. each cell of width w holds one circle (random centre, radius,
// lift); the edge is the highest circle top over the neighbouring cells, so tops are round and the valleys
// between puffs pinch, like a cut cloud. two sizes stacked. returns height in units of w.
float puffRow(float x, float w, float seed, float state) {
  float c = floor(x / w), h = 0.0;
  for (int i = -1; i <= 1; i++) {
    float k = c + float(i);
    float cx = (k + 0.2 + 0.6 * hash(vec2(k, seed))) * w;
    float r = w * (0.55 + 0.45 * hash(vec2(k + 17.0, seed)));
    float lift = w * 0.4 * hash(vec2(k + 31.0, seed)) + w * 0.03 * (hash(vec2(k, seed + state)) - 0.5);
    float dx = x - cx;
    h = max(h, lift + sqrt(max(0.0, r * r - dx * dx)));
  }
  return h / w;
}
float aastep(float t, float v) { float w = length(vec2(dFdx(v), dFdy(v))) * 0.70710678; return smoothstep(t - w, t + w, v); }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }

// ink coverage of a rough stroke along a shape edge. d = signed distance (px), along = position on the edge (px)
float stroke(float d, float along, vec2 s, float state, float seed) {
  float drift = (noise(vec2(along * 0.02 + seed, state * 7.1)) - 0.5) * s.y * uDpr;
  float weight = s.x * uDpr * (0.55 + 0.9 * noise(vec2(along * 0.006 + seed * 3.0, state * 3.3)));
  return 1.0 - aastep(weight * 0.5, abs(d - drift));
}
vec4 rect(vec4 r) { return vec4(r.x + r.z * 0.5, uRes.y - (r.y + r.w * 0.5), r.z * 0.5, r.w * 0.5); } // centre (GL), half size

// the panel's environment at device px p (sky, fog plate, ground strokes, cast shadow, engraved ground marks).
// a function of p so the glass can look it up at a refracted position (look/glass.js)
vec3 envAt(vec2 p, vec4 pr, float state) {
  vec3 env = uPaper;
  if (uEnv > 0.5) {
    // our own "figure in the mist" plate: sky (ink or a colour ground), a lumpy white fog bank rising from
    // the horizon, dashed ground strokes, a hatched cast shadow. everything boils with the panel border.
    float top = pr.y + pr.w, h = 2.0 * pr.w;               // panel top (GL y) and height
    float yRel = (top - p.y) / h;                          // 0 at panel top .. 1 at bottom
    float x = (p.x - (pr.x - pr.z)) / uDpr;                // CSS px from the panel's left edge
    // the fog rises in a mass behind the figure so the figure always reads against white (silhouette rule)
    float fx = (uShadow.x - (pr.x - pr.z)) / uDpr, fw = 2.6 * uShadow.z / uDpr;
    float peak = uFogPeak * exp(-pow((x - fx) / max(fw, 1.0), 2.0));
    float soft = 0.35 + fbm(vec2(x / uFogScale, state * 0.37));
    // puff heights are in CSS px like x (dividing by the panel height in CSS px keeps the circles round)
    float w1 = uFogScale * 0.95, w2 = uFogScale * 0.42;
    float xc = x + 5.0 * (noise(vec2(x / 14.0, state * 0.9)) - 0.5);        // a hand-cut wobble on the outline
    float hpx = max(puffRow(xc, w1, 3.0, state) * w1, puffRow(xc + 37.0, w2, 9.0, state) * w2 + 0.3 * w1);
    float puffs = hpx / (h / uDpr);
    float edge = uHorizon - mix(uFogAmp * soft, uFogAmp * 0.25 + puffs, uBillow) - peak;
    float sky = 1.0 - aastep(edge, yRel);                  // 1 above the fog edge
    if (uBillow > 0.5) {
      // a few loose puffs drifting above the bank (cell hash picks ~1 in 4 cells), bobbing with the boil
      float cw = uFogScale * 1.1, cell = floor(x / cw);
      if (hash(vec2(cell, 41.0)) > 0.72) {
        float yPx = yRel * h / uDpr, top = (uHorizon - uFogAmp * 0.25) * h / uDpr - 0.55 * w1 * 2.2;
        vec2 c = vec2((cell + 0.3 + 0.4 * hash(vec2(cell, 43.0))) * cw, top - 40.0 - 60.0 * hash(vec2(cell, 47.0)) + 2.0 * (hash(vec2(cell, state)) - 0.5));
        float r = 9.0 + 14.0 * hash(vec2(cell, 53.0));
        sky *= aastep(r, length(vec2(xc, yPx) - c));
      }
    }
    env = mix(uPaper, uSky, sky);
    float gy = (yRel - uHorizon) * h / uDpr;               // CSS px below the horizon
    if (gy > 0.0) {
      float rows = floor(gy / 26.0);
      float lineD = abs(mod(gy, 26.0) - 13.0);             // a stroke every 26 px
      float dash = step(0.45, noise(vec2(x * 0.03 + rows * 5.1, rows + state * 0.21)));
      float w = 1.0 + 0.8 * noise(vec2(x * 0.05, rows + state));
      env = mix(env, uInk, (1.0 - aastep(w, lineD)) * dash * step(1.0, rows));
    }
    if (uShadow.z > 0.0) {
      vec2 sp = vec2(uShadow.x, uRes.y - uShadow.y);
      vec2 q = (p - sp) / vec2(uShadow.z, uShadow.z * 0.16);
      float inEll = 1.0 - aastep(1.0, length(q) + (noise(vec2(atan(q.y, q.x) * 3.0, state)) - 0.5) * 0.15);
      float stripe = abs(mod(p.y / uDpr, 4.0) - 2.0);      // 2 px lines every 4 px (D5 floor shadow)
      float taper = 1.0 - abs(q.x);
      env = mix(env, uInk, inEll * (1.0 - aastep(0.4 + 1.2 * taper, stripe)));
    }
  } else {
    env = uSky;                                            // plain ground (paper, ink or a colour field)
  }
  if (uGround.x > 0.5) {
    vec2 q = vec2(p.x - (pr.x - pr.z), (pr.y + pr.w) - p.y) / uDpr;           // CSS px from the panel's top left
    float gt = uGround.x;
    if (gt > 1.5 && gt < 2.5) env = mix(env, uInk, woodgrain(q, state, uGround.w) * uGround.y);
    // dry brush only on dark sky: on paper it would leave grey (art bible: no grey)
    else if (gt > 2.5) env = mix(env, env * 0.55, drybrush(q, state, uGround.w) * uGround.y * step(dot(env, vec3(0.333)), 0.4));
  }
  return env;
}


void main() {
  vec2 p = gl_FragCoord.xy;
  // boil state, wrapped: unbounded, its noise arguments grew for as long as the page stayed open and the marks
  // degraded (measured 2026-10-11: after 1 h the border wobble was gone, after 10 h the fog edge was a smooth bump,
  // after 100 h the ground strokes had vanished). 4096 states = 512 s at 8 fps before a pattern repeats
  float state = mod(floor(uTime * uBoilFps), 4096.0);

  if (uMode == 2) {
    // paper grain, multiplied over the finished frame (blend = multiply), in screen (sRGB) values:
    // white * (1 - grain * 0.5) on average, 0.09 -> #F3F3F3. one noise texel per device pixel, moving with the page.
    float g = texture2D(tBlue, (p + vec2(0.0, uScrollY * uDpr)) / 128.0).r;
    gl_FragColor = vec4(vec3(1.0 - uGrain * g), 1.0);
    return;
  }

  vec3 col = uPaper;
  float ink = 0.0, covered = 0.0;
  if (uMode == 0) {
    covered = 1.0;
    vec4 pr = rect(uPanel);
    float dp = sdBox(p - pr.xy, pr.zw);
    if (dp < 0.0) {
      vec2 uvS = uFit > 0.5 ? (p - (pr.xy - pr.zw)) / (2.0 * pr.zw) : vUv;
      vec4 fig = texture2D(tScene, uvS);
      // refraction (look/glass.js): the glass writes a screen-space offset (RG, 0.5 = none) and a mask (B) into its own
      // target; the environment is looked up at the bent position, so the ground marks really bend through the glass
      vec2 pe = p;
      if (uRefract > 0.5) { vec4 rf = texture2D(tRefract, vUv); pe += (rf.xy * 2.0 - 1.0) * uRefractPx * uDpr * rf.b; }
      vec3 env = envAt(pe, pr, state);
      if (uMap > 0.5) {
        // map sheet: water lines (2 px every 4 px) over the sea, then the ink lines with a boiling woodcut edge
        vec4 m = texture2D(tMap, vUv);
        // horizontal water lines every 4 px, hard-stepped (axis-aligned lines AA'd on a 4 px period read grey):
        // half width grows with distance from the shore (G) until neighbouring lines merge into solid ink
        float far = smoothstep(0.08, 0.5, m.g);
        float hw = mix(0.75, 2.6, far) + 0.35 * (noise(vec2(p.x / (40.0 * uDpr), floor(p.y / (4.0 * uDpr)) + state)) - 0.5);
        float water = step(abs(mod(p.y / uDpr, 4.0) - 2.0), hw);
        env = mix(env, uInk, step(0.1, m.g) * water);
        float ln = m.r + (noise(p / (5.0 * uDpr) + state * 1.7) - 0.5) * 0.3;
        env = mix(env, uInk, aastep(0.5, ln));
      }
      if (uTrail > 0.5) {
        // ink trail: crisp woodcut edge with a little boil on the threshold
        float tr = texture2D(tTrail, vUv).r + (noise(p / (6.0 * uDpr) + state * 1.7) - 0.5) * 0.25;
        env = mix(env, uInk, aastep(0.5, tr));
      }
      col = mix(env, fig.rgb, fig.a * uFigure);
      if (uGround.x > 0.5 && uGround.x < 1.5) {
        // gouges cut OVER the figure as well: it is carved away, never faded (woodcut has no transparency)
        vec2 q = vec2(p.x - (pr.x - pr.z), (pr.y + pr.w) - p.y) / uDpr;
        float yr = q.y / (2.0 * pr.w / uDpr);
        col = mix(col, uInk, gouge(q, uGround.z + (yr - 0.5) * 1.6, state, uGround.w) * uGround.y);
      }
      if (uTitle > 0.5) col = mix(col, uPaper, aastep(0.5, texture2D(tTitle, vUv).r));
    }
    ink = stroke(dp, p.x + p.y, uPanelStroke, state, 0.0);
  }

  for (int i = 0; i < ${MAX_BOXES}; i++) {
    if (i >= uBoxCount) break;
    vec4 br = rect(uBoxes[i]);
    float db = sdBox(p - br.xy, br.zw);
    if (db < 0.0) { col = uPaper; ink = 0.0; covered = 1.0; }
    float sb = stroke(db, p.x + p.y, uBoxStroke, state, float(i + 1) * 11.0);
    ink = max(ink, sb); covered = max(covered, sb);
  }
  if (uMode == 1 && uBadge.w > 0.5) {
    vec2 c = vec2(uBadge.x, uRes.y - uBadge.y);
    float dc = length(p - c) - uBadge.z;
    if (dc < 0.0) {
      col = uPaper; ink = 0.0; covered = 1.0;
      if (uBadgeFill > 0.0) {                                  // the ink surface wobbles a little as it rises
        float level = c.y - uBadge.z + 2.0 * uBadge.z * uBadgeFill + (noise(vec2(p.x / (9.0 * uDpr), state * 0.7)) - 0.5) * 4.0 * uDpr * (1.0 - uBadgeFill);
        col = mix(col, uInk, 1.0 - aastep(level, p.y));
      }
    }
    float sc = stroke(dc, atan(p.y - c.y, p.x - c.x) * uBadge.z, uBoxStroke, state, 77.0);
    ink = max(ink, sc); covered = max(covered, sc);
  }
  if (uMode == 1 && covered < 0.01) discard;                   // overlay only touches its shapes
  col = mix(col, uInk, ink);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`

export const panelParams = {
  panelStroke: 4.5, panelDrift: 2.5, boxStroke: 3.5, boxDrift: 1.5, grain: 0.09, ink: '#151515', paper: '#ffffff',
  env: true, horizon: 0.78, fogAmp: 0.32, fogScale: 140, fogPeak: 0.5, sky: '#151515',
}
export const panelRanges = {
  panelStroke: { min: 0, max: 12 }, horizon: { min: 0.3, max: 1 }, fogAmp: { min: 0, max: 0.8 }, fogScale: { min: 20, max: 600 }, fogPeak: { min: 0, max: 1 }, panelDrift: { min: 0, max: 8 }, boxStroke: { min: 0, max: 10 }, boxDrift: { min: 0, max: 6 }, grain: { min: 0, max: 0.3 },
}

export function createPanel(renderer) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2())
  const blue = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}tex/bluenoise128.png`)
  blue.wrapS = blue.wrapT = THREE.RepeatWrapping
  blue.minFilter = blue.magFilter = THREE.NearestFilter
  blue.colorSpace = THREE.NoColorSpace
  const material = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: fragment,
    uniforms: {
      tScene: { value: null }, tBlue: { value: blue }, uRes: { value: size }, uDpr: { value: 1 },
      uTime: { value: 0 }, uBoilFps: { value: 8 }, uScrollY: { value: 0 }, uGrain: { value: 0.09 },
      uInk: { value: new THREE.Color() }, uPaper: { value: new THREE.Color() }, uSky: { value: new THREE.Color() }, uMode: { value: 0 }, uFit: { value: 0 }, tTrail: { value: null }, uTrail: { value: 0 }, tMap: { value: null }, uMap: { value: 0 }, tTitle: { value: null }, uTitle: { value: 0 }, tRefract: { value: null }, uRefract: { value: 0 }, uRefractPx: { value: 24 }, uBillow: { value: 0 }, uGround: { value: new THREE.Vector4() }, uFigure: { value: 1 }, uBadgeFill: { value: 0 },
      uPanel: { value: new THREE.Vector4() }, uPanelStroke: { value: new THREE.Vector2() },
      uBoxes: { value: Array.from({ length: MAX_BOXES }, () => new THREE.Vector4()) }, uBoxCount: { value: 0 },
      uBoxStroke: { value: new THREE.Vector2() }, uBadge: { value: new THREE.Vector4() },
      uEnv: { value: 0 }, uHorizon: { value: 0.62 }, uFogAmp: { value: 0.35 }, uFogScale: { value: 140 }, uFogPeak: { value: 0.45 }, uShadow: { value: new THREE.Vector3() },
    },
    depthTest: false, depthWrite: false,
  })
  // one triangle that covers the screen
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2))
  const quad = new THREE.Mesh(geometry, material)
  quad.frustumCulled = false
  const post = new THREE.Scene(); post.add(quad)
  const postCam = new THREE.Camera()

  const toPx = (el, dpr, v) => { const r = el.getBoundingClientRect(); return v.set(r.left * dpr, r.top * dpr, r.width * dpr, r.height * dpr) }
  // ONE shared scene target: every panel renders its scene and is composited at once in renderPanel, so the
  // target is free again before the next panel. (v2 kept one full-screen 4x MSAA half-float target per panel
  // key and never freed them: 7 keys in the story, about 2 GB at a 3024x1964 drawing buffer; review 2026-10-11)
  let shared = null, samples = 4                         // MSAA samples of the scene targets (quality tiers: 4 or 0)
  const targetFor = () => {
    if (!shared) shared = new THREE.WebGLRenderTarget(size.x, size.y, { samples, type: THREE.HalfFloatType })
    if (shared.width !== size.x || shared.height !== size.y) shared.setSize(size.x, size.y)
    return shared
  }
  // insets (fit) render at their own size in device px and are drawn 1:1. v3 squeezed the full-screen target
  // into a 22vw inset: hatch spacing 2.5 px, outlines 0.6-1.6 px instead of 4.4, moire (review #7, measured with
  // tools/inset-probe.mjs). one target per inset key, resized only when that inset's size changes (a resize);
  // nearest sampling, so a panel edge on a fractional pixel can't blend neighbouring texels into grey
  const insets = new Map()
  const insetFor = (key, w, h) => {
    let t = insets.get(key)
    if (!t) insets.set(key, (t = new THREE.WebGLRenderTarget(w, h, { samples, type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })))
    else if (t.width !== w || t.height !== h) t.setSize(w, h)
    return t
  }
  const u = material.uniforms
  // several passes build one frame, so nothing may clear the canvas between them (three.js clears by default)
  renderer.autoClear = false
  function common(p, t, scrollY) {
    renderer.getDrawingBufferSize(size)
    const dpr = renderer.getPixelRatio()
    u.uDpr.value = dpr; u.uTime.value = t; u.uBoilFps.value = p.boilFps ?? 8; u.uScrollY.value = scrollY; u.uGrain.value = p.grain
    u.uInk.value.set(p.ink); u.uPaper.value.set(p.paper); u.uSky.value.set(p.sky ?? p.ink)
    u.uPanelStroke.value.set(p.panelStroke, p.panelDrift); u.uBoxStroke.value.set(p.boxStroke, p.boxDrift)
    return dpr
  }
  function setBoxes(els, dpr) {
    els.slice(0, MAX_BOXES).forEach((el, i) => toPx(el, dpr, u.uBoxes.value[i]))
    u.uBoxCount.value = Math.min(els.length, MAX_BOXES)
  }
  const draw = () => { renderer.setRenderTarget(null); renderer.render(post, postCam) }

  // one beat: its 3D scene inside its panel element, its environment and its caption boxes (scissored to the panel)
  // fit: render the camera at the panel's aspect and map the whole image into the panel (insets)
  function renderPanel(key, scene, camera, p, t, { panel, boxes = [], shadow, fit = false }, scrollY = 0) {
    const dpr = common(p, t, scrollY)
    const r = panel.getBoundingClientRect()
    if (r.bottom < -40 || r.top > innerHeight + 40) return false
    const aspect = camera.aspect
    // an inset is snapped to the device-pixel grid and its target has exactly that size, so every pixel samples one
    // texel centre (a target of round(w) texels under a fractional rect dropped or doubled a column: 282 texels in
    // 281.6 px at 1280 px wide; review of de0c4b1)
    const snap = fit && [Math.round(r.left * dpr), Math.round(r.top * dpr), Math.round(r.right * dpr), Math.round(r.bottom * dpr)]
    if (fit) { camera.aspect = (snap[2] - snap[0]) / Math.max(1, snap[3] - snap[1]); camera.updateProjectionMatrix() }
    const target = fit ? insetFor(key, Math.max(1, snap[2] - snap[0]), Math.max(1, snap[3] - snap[1])) : targetFor()
    const bg = scene.background; scene.background = null   // the compositor owns the background, always
    renderer.setClearColor(0x000000, 0)                   // figure alpha masks the environment / colour ground
    renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera)
    scene.background = bg
    if (fit) { camera.aspect = aspect; camera.updateProjectionMatrix() }
    u.uFit.value = fit ? 1 : 0
    u.uTrail.value = p.trail ? 1 : 0; u.tTrail.value = p.trail ?? null
    u.uMap.value = p.map ? 1 : 0; u.tMap.value = p.map ?? null; u.uFigure.value = p.figure === false ? 0 : typeof p.figure === 'number' ? p.figure : 1
    u.uTitle.value = p.title ? 1 : 0; u.tTitle.value = p.title ?? null; u.uBillow.value = p.billow ?? 0
    // refraction is drawn for screen-aligned panels only: tRefract is a screen-space map sampled at vUv, a fit panel
    // (inset) samples its scene at its own uv and aspect (review of 7e5f3d4). known limit: envAt's anti-aliasing takes
    // derivatives of the bent position, so env: true plates (fog edge, ground strokes) would alias along the glass edge
    u.uRefract.value = p.refract && !fit ? 1 : 0; u.tRefract.value = p.refract ?? null; u.uRefractPx.value = p.refractPx ?? 24
    const gr = p.ground, types = { gouge: 1, grain: 2, brush: 3 }
    u.uGround.value.set(gr ? types[gr.type] ?? 0 : 0, gr?.amount ?? 1, gr?.tone ?? 0.5, gr?.seed ?? 1)
    u.tScene.value = target.texture; u.uMode.value = 0
    if (fit) u.uPanel.value.set(snap[0], snap[1], snap[2] - snap[0], snap[3] - snap[1]); else toPx(panel, dpr, u.uPanel.value)
    setBoxes(boxes, dpr)
    u.uEnv.value = p.env ? 1 : 0; u.uHorizon.value = p.horizon; u.uFogAmp.value = p.fogAmp; u.uFogScale.value = p.fogScale; u.uFogPeak.value = p.fogPeak
    const sh = shadow ?? { x: 0, y: 0, w: 0 }
    u.uShadow.value.set(sh.x * dpr, sh.y * dpr, sh.w * dpr)
    const m = 24 * dpr                                     // room for the stroke drift around the panel
    renderer.setScissorTest(true)
    renderer.setScissor((r.left * dpr - m) / dpr, (size.y - r.bottom * dpr - m) / dpr, (r.width * dpr + 2 * m) / dpr, (r.height * dpr + 2 * m) / dpr)
    draw()
    renderer.setScissorTest(false)
    return true
  }
  // fixed UI on top of every panel: nav pill, badge
  function renderOverlay(p, t, { boxes = [], badge }, scrollY = 0) {
    const dpr = common(p, t, scrollY)
    setBoxes(boxes, dpr)
    u.uBadge.value.set(badge.x * dpr, badge.y * dpr, badge.r * dpr, badge.visible ? 1 : 0)
    u.uBadgeFill.value = badge.fill ?? 0
    u.uMode.value = 1; draw()
  }
  // paper grain over the finished frame
  const grainBlend = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor }
  function renderGrain(p, t, scrollY = 0) {
    common(p, t, scrollY)
    Object.assign(material, grainBlend); u.uMode.value = 2; draw()
    material.blending = THREE.NormalBlending
  }
  function clear(p) {
    renderer.setRenderTarget(null); renderer.setClearColor(new THREE.Color(p.paper), 1); renderer.clear()
  }

  // the old single-panel call, kept for scenes/panel.js
  function render(scene, camera, p, t, layout, scrollY = 0) {
    clear(p)
    renderPanel('main', scene, camera, p, t, { panel: layout.panel, boxes: layout.boxes.filter((b) => !b.classList.contains('pill')), shadow: layout.shadow }, scrollY)
    renderOverlay(p, t, { boxes: layout.boxes.filter((b) => b.classList.contains('pill')), badge: layout.badge }, scrollY)
    renderGrain(p, t, scrollY)
  }
  // quality tiers: a new MSAA sample count rebuilds the targets on next use (a target's samples are fixed when made)
  function setSamples(n) {
    if (n === samples) return
    samples = n; shared?.dispose(); shared = null
    for (const t of insets.values()) t.dispose()
    insets.clear()
  }
  return { render, renderPanel, renderOverlay, renderGrain, clear, setSamples, get samples() { return samples } }
}

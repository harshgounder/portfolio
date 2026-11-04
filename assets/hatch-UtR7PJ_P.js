import{Ar as e,S as t,ai as n,oi as r,si as i}from"./three.core-Di7UvO4-.js";var a=`
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
`,o=`
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
`,s={lineTile:90,lineAngle:1.3,lineTilt:.2,wobble:.35,tooth:.25,shadow:.35,high:.75,bounce:-.85,midWidth:.55,stipple:.8,dash:.6,boilFps:8,boilStates:4,outline:4.4,lightAz:-1.3,lightEl:.4,ink:`#151515`,mid:`#b09c76`,skin:`#ffffff`,paper:`#ffffff`,ao:.6},c={lineTile:{min:10,max:300},lineAngle:{min:-3.14,max:3.14},lineTilt:{min:-2,max:2},wobble:{min:0,max:1.5},tooth:{min:0,max:1},shadow:{min:-1,max:1},high:{min:-1,max:1},bounce:{min:-1,max:0},midWidth:{min:0,max:1},stipple:{min:0,max:1},dash:{min:0,max:3},boilFps:{min:0,max:24,step:1},ao:{min:0,max:2},boilStates:{min:1,max:8,step:1},outline:{min:0,max:12},lightAz:{min:-3.14,max:3.14},lightEl:{min:-1.5,max:1.5}};function l(){let s={uTime:{value:0},uResolution:{value:new n(1,1)},uOutline:{value:0},uInk:{value:new t},uMid:{value:new t},uPaper:{value:new t},uLightDir:{value:new r},uLineAxis:{value:new r},uLineAlong:{value:new r},uAo:{value:.6},uBoilFps:{value:8},uBoilStates:{value:4},uLineTile:{value:90},uWobble:{value:0},uTooth:{value:0},uShadow:{value:0},uHigh:{value:0},uBounce:{value:0},uMidWidth:{value:0},uStipple:{value:0},uDash:{value:0}},c=new e({uniforms:s,vertexShader:a,fragmentShader:o,side:2}),l=new e({uniforms:s,vertexShader:a,fragmentShader:o,side:1,defines:{OUTLINE:``}});l.uniforms={...s,uOutline:{value:0}};let u=[],d=[];function f({midKey:n=`mid`,ao:r=!1,hatchPos:i=!1}={}){let c=new e({uniforms:{...s,uMid:{value:new t}},vertexShader:a,fragmentShader:o,side:2,defines:{...r?{USE_AO:``}:{},...i?{USE_HATCHPOS:``}:{}}});return u.push([c,n]),c}let p=0,m=new n;function h(e){e.onBeforeRender=(e,t,n,r,i)=>{let a=e.getRenderTarget();a?m.set(a.width,a.height):e.getDrawingBufferSize(m),s.uResolution.value.copy(m),l.uniforms.uOutline.value=p*e.getPixelRatio(),i.uniformsNeedUpdate=!0}}function g(e,t){let n=s;n.uTime.value=t,n.uInk.value.set(e.ink),n.uMid.value.set(e.mid),n.uPaper.value.set(e.paper),n.uLightDir.value.set(Math.cos(e.lightEl)*Math.sin(e.lightAz),Math.sin(e.lightEl),Math.cos(e.lightEl)*Math.cos(e.lightAz)),n.uLineAxis.value.set(Math.cos(e.lineAngle),Math.sin(e.lineAngle),e.lineTilt).normalize(),n.uLineAlong.value.set(-Math.sin(e.lineAngle),Math.cos(e.lineAngle),0).normalize();for(let[t,r]of[[`boilFps`,`uBoilFps`],[`boilStates`,`uBoilStates`],[`lineTile`,`uLineTile`],[`wobble`,`uWobble`],[`tooth`,`uTooth`],[`shadow`,`uShadow`],[`high`,`uHigh`],[`bounce`,`uBounce`],[`midWidth`,`uMidWidth`],[`stipple`,`uStipple`],[`dash`,`uDash`]])n[r].value=e[t];p=e.outline,n.uAo.value=e.ao??0;for(let[t,n]of u)t.uniforms.uMid.value.set(e[n]??e.mid)}function _({midKey:t=`mid`}={}){let r={uCrumble:{value:0},uCrumbleShape:{value:new i(.6,1.2,1.6,.6)},uCrumbleY:{value:new n(0,1)},uPointer:{value:new i}},c=f({midKey:t});Object.assign(c.uniforms,r),c.defines.USE_CRUMBLE=``;let u=new e({uniforms:{...s,...r},vertexShader:a,fragmentShader:o,side:1,defines:{OUTLINE:``,USE_CRUMBLE:``}});return u.uniforms.uOutline=l.uniforms.uOutline,d.push(u),{fill:c,outline:u,uniforms:r}}return{fill:c,fillFor:f,outline:l,update:g,bindOutline:h,crumbleMaterials:_}}export{s as n,c as r,l as t};
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { createHatch, hatchParams, hatchRanges } from '../look/hatch.js'

// GLSL material on WebGLRenderer, TSL material on WebGPURenderer (same params, same update API)

// the hatch look on a walking character. model: our own character lives in chars/ (shipped), the three.js test
// models (Xbot, Soldier) in models/ (local only, never shipped; the GUI lists them for local tests).
// animSource: where the walk clip comes from when the model has none (same bone names, retargetFromRest); null = none
// default = our shipped character with its CC0 walk (works on a fresh clone); the three.js test models are local only
export const params = { ...hatchParams, model: 'mapmaker-walk', animSource: null, clip: 'walk', animate: true, pose: 0.4, rest: false }
export const ranges = { ...hatchRanges, model: { options: { Xbot: 'Xbot', Soldier: 'Soldier', mapmaker: 'mapmaker', 'mapmaker (CC0 walk)': 'mapmaker-walk', 'mapmaker (Xbot walk, local)': 'mapmaker-walk.local' } }, pose: { min: 0, max: 2 } }
// our character ships meshopt-compressed (.min.glb, gltf-transform); the three.js test models are plain
const modelUrl = (name) => `${import.meta.env.BASE_URL}${name.startsWith('mapmaker') ? `chars/${name}.min` : `models/${name}`}.glb`

// a clip borrowed from another rig with the same bone NAMES (e.g. a Mixamo walk on our Mixamo-named rig), retargeted
// in world space with the same rules as art/character/retarget.py (the Blender bake), parents first:
//   torso, legs, head: the source bone's CHANGE from its own rest, applied to our rest (bone rolls differ)
//   arms (Shoulder, Arm, ForeArm, Hand): swing our bone so it points where the source bone points (the rests
//     differ: T-pose source, A-pose ours; change-from-rest put the hands crossed in front of the chest)
//   fingers and bones the source lacks: rest
// v1 copied local rotations by name: arms thrown up, legs crumpled (review #8). the hips also move by the source's
// displacement from rest, scaled by the ratio of rest hip heights (cm vs m rigs). sampled at `fps`.
// checked against the Blender bake by lab/tools/retarget-probe.mjs.
function retargetFromRest(clip, source, target, fps = 30) {
  const bonesOf = (root) => { const m = new Map(); root.traverse((o) => { if (o.isBone) m.set(o.name, o) }); return m }
  const src = bonesOf(source), dst = bonesOf(target)
  const order = [...dst.values()]                                  // traverse order = parents before children
  const q = (o) => o.getWorldQuaternion(new THREE.Quaternion()), pos = (o) => o.getWorldPosition(new THREE.Vector3())
  source.updateMatrixWorld(true); target.updateMatrixWorld(true)
  const srcRest = new Map([...src].map(([n, o]) => [n, q(o)])), dstRest = new Map(order.map((o) => [o.name, q(o)]))
  const dstLocalRest = new Map(order.map((o) => [o.name, o.quaternion.clone()]))
  const isFinger = (n) => /Hand(Thumb|Index|Middle|Ring|Pinky)\d/.test(n)
  const isArm = (n) => /(Shoulder|Arm|ForeArm|Hand)$/.test(n)
  // an arm bone's direction = towards its child (three.js bones have no tail); a hand points at its middle finger
  const childOf = (b) => { const kids = b.children.filter((c) => c.isBone && src.has(c.name)); return kids.find((c) => /Middle1$/.test(c.name)) ?? kids[0] }
  const dirRest = new Map(order.filter((b) => isArm(b.name) && childOf(b)).map((b) => [b.name, pos(childOf(b)).sub(pos(b)).normalize()]))
  const tHips = order.find((o) => /Hips$/.test(o.name)) ?? order[0], hipsName = tHips.name, sHips = src.get(hipsName)
  const sHips0 = sHips && pos(sHips), tHips0 = pos(tHips), ratio = sHips ? tHips0.y / Math.max(1e-6, sHips0.y) : 1
  const parentInv = tHips.parent.matrixWorld.clone().invert()     // the hips' parent (armature node) does not move
  const mixer = new THREE.AnimationMixer(source); mixer.clipAction(clip).play()
  const n = Math.max(2, Math.round(clip.duration * fps) + 1), times = [], rot = new Map(order.map((o) => [o.name, []])), hp = []
  const world = new Map(), d = new THREE.Quaternion(), w = new THREE.Quaternion(), l = new THREE.Quaternion(), pq = new THREE.Quaternion()
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1)) * clip.duration; times.push(t)
    mixer.setTime(t); source.updateMatrixWorld(true)
    for (const b of order) {
      const parentW = b.parent?.isBone ? world.get(b.parent.name) : b.parent.getWorldQuaternion(pq)
      const s = src.get(b.name)
      if (s && dirRest.has(b.name)) {                                 // arms: swing to the source's direction
        const c = src.get(childOf(b).name), ds = pos(c).sub(pos(s)).normalize()
        w.setFromUnitVectors(dirRest.get(b.name), ds).multiply(dstRest.get(b.name))
      } else if (s && !isFinger(b.name)) { d.multiplyQuaternions(q(s), srcRest.get(b.name).clone().invert()); w.multiplyQuaternions(d, dstRest.get(b.name)) }
      else w.multiplyQuaternions(parentW, dstLocalRest.get(b.name))     // fingers + bones the source lacks: rest
      l.copy(parentW).invert().multiply(w)
      world.set(b.name, w.clone()); rot.get(b.name).push(l.x, l.y, l.z, l.w)
    }
    if (sHips) { const p = tHips0.clone().addScaledVector(pos(sHips).sub(sHips0), ratio).applyMatrix4(parentInv); hp.push(p.x, p.y, p.z) }
  }
  mixer.stopAllAction(); mixer.uncacheRoot(source)
  const tracks = order.map((b) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, rot.get(b.name)))
  if (sHips) tracks.push(new THREE.VectorKeyframeTrack(`${hipsName}.position`, times, hp))
  return new THREE.AnimationClip(clip.name, clip.duration, tracks)
}

// line space for the hatch (review #17): each vertex's MEAN skinned position over the walk cycle, as a `hatchPos`
// attribute. fixed per vertex, so the lines stay on the surface while it moves (no swim); skinned, so it is in the
// same world units as what is drawn (the raw `position` is not: the hat's skin keeps a 4.2x scale in its bind
// matrices); and the mean of the cycle, so lines sit on the limbs as in a typical walking pose, not the A-pose rest.
// returns the bake time in ms (about 20k vertices x n poses on the CPU, once at load)
function bakeHatchPos(model, mixer, clip, n = 16) {
  const t0 = performance.now(), meshes = [], v = new THREE.Vector3()
  model.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o) })
  const acc = meshes.map((o) => new Float32Array(o.geometry.attributes.position.count * 3))
  for (let k = 0; k < n; k++) {
    mixer.setTime((k / n) * clip.duration); model.updateMatrixWorld(true)
    meshes.forEach((o, j) => {
      const a = acc[j]
      for (let i = 0; i < a.length / 3; i++) { o.getVertexPosition(i, v); a[3 * i] += v.x / n; a[3 * i + 1] += v.y / n; a[3 * i + 2] += v.z / n }
    })
  }
  meshes.forEach((o, j) => o.geometry.setAttribute('hatchPos', new THREE.BufferAttribute(acc[j], 3)))
  return performance.now() - t0
}

export async function create({ renderer, camera }) {
  const scene = new THREE.Scene()
  const hatch = renderer.isWebGPURenderer ? (await import('../look/hatch-tsl.js')).createHatch() : createHatch()
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  // the test models and the local walk bake are git-ignored: on a fresh clone fall back to our committed
  // character, standing in its bind pose when no walk clip is found
  const tryLoad = (name) => loader.loadAsync(modelUrl(name)).catch(() => (console.warn(`model ${name} missing (local only), skipped`), null))
  let gltf = await tryLoad(params.model)
  if (!gltf) { params.model = 'mapmaker'; gltf = await loader.loadAsync(modelUrl('mapmaker')) }
  const borrowed = gltf.animations.length || !params.animSource ? null : await tryLoad(params.animSource)
  const animations = gltf.animations.length ? gltf.animations : borrowed?.animations ?? []
  if (!animations.length) params.rest = true
  const model = gltf.scene
  // rest pose = the bones' transforms as loaded (glTF rest), taken before anything poses them (bakeHatchPos does).
  // skeleton.pose() is not used: it treats the root bone's world matrix as local and drops the armature node's own
  // transform, which blew our character up
  const restPose = []
  model.traverse((o) => o.isBone && restPose.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]))
  const hulls = []
  const mixer = new THREE.AnimationMixer(model)
  let clip = THREE.AnimationClip.findByName(animations, params.clip) ?? animations[0]
  if (clip && !gltf.animations.length) clip = retargetFromRest(clip, borrowed.scene, model)
  if (clip) mixer.clipAction(clip).play()
  const baked = clip ? bakeHatchPos(model, mixer, clip) : 0
  model.traverse((o) => {
    if (!o.isMesh) return
    // skin (body) in paper, everything else (coat, sleeves, hat) in the middle colour; baked AO when present
    o.material = hatch.fillFor({ midKey: /body/i.test(o.name) ? 'skin' : 'mid', ao: '_ao' in o.geometry.attributes, hatchPos: 'hatchPos' in o.geometry.attributes })
    o.frustumCulled = false
    // outline = a second skinned copy drawn back-face only, pushed out in screen space
    const hull = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, hatch.outline) : new THREE.Mesh(o.geometry, hatch.outline)
    if (o.isSkinnedMesh) hull.bind(o.skeleton, o.bindMatrix)
    hull.frustumCulled = false
    hatch.bindOutline(hull)                     // width from the target this draw goes to (review #6)
    hulls.push([o, hull])
  })
  for (const [o, hull] of hulls) {
    hull.position.copy(o.position); hull.quaternion.copy(o.quaternion); hull.scale.copy(o.scale)
    o.parent.add(hull)
  }
  scene.add(model)

  // foot plants of the clip, found once: each foot's height over two cycles with hysteresis (lift 6 cm to re-arm,
  // plant below 2 cm over its lowest point). footsteps fire when a beat's walk time crosses these phases, so they
  // follow a scroll-scrubbed walk exactly and never read bones posed by another beat (review 2026-10-11)
  const plants = []
  if (clip) {
    const feet = []; model.traverse((o) => { if (o.isBone && /(Left|Right)Foot$/.test(o.name)) feet.push(o) })
    const N = 240, v = new THREE.Vector3()
    const h = feet.map(() => [])
    for (let i = 0; i < N; i++) { mixer.setTime((i / N) * clip.duration); model.updateMatrixWorld(true); feet.forEach((f, j) => h[j].push(f.getWorldPosition(v).y)) }
    feet.forEach((f, j) => {
      const lo = Math.min(...h[j]); let armed = false
      for (let i = 0; i < 2 * N; i++) {
        const y = h[j][i % N]
        if (y > lo + 0.06) armed = true
        else if (armed && y < lo + 0.02) { armed = false; if (i >= N || !plants.some((p) => p.left === /Left/.test(f.name) && Math.abs(p.t - (i % N) / N * clip.duration) < 0.05)) plants.push({ t: ((i % N) / N) * clip.duration, left: /Left/.test(f.name) }) }
      }
    })
    const uniq = []; for (const p of plants.sort((a, b) => a.t - b.t)) if (!uniq.some((q) => q.left === p.left && Math.abs(q.t - p.t) < 0.05)) uniq.push(p)
    plants.length = 0; plants.push(...uniq)
  }

  camera.position.set(0, 1.0, 3.8)
  camera.lookAt(0, 0.9, 0)

  return {
    scene,
    model,
    clips: animations.map((c) => c.name),
    hatchBakeMs: baked,
    loader,                                                       // the meshopt-ready GLTFLoader, for extra models
    get walking() { return !params.rest && !!clip },             // time-driven or scroll-scrubbed (story beats)
    clipDuration: clip?.duration ?? 0,
    plants,
    // scroll-driven walks set the clip time themselves (story beats with `walk`)
    setWalkTime(t) { if (clip) mixer.setTime(t) },
    update(t) {
      scene.background = new THREE.Color(params.paper)
      if (params.rest) for (const [b, p, q, k] of restPose) { b.position.copy(p); b.quaternion.copy(q); b.scale.copy(k) } // rest pose, no animation
      else mixer.setTime(params.animate ? t : params.pose)
      hatch.update(params, t)
    },
  }
}

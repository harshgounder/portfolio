import * as THREE from 'three'
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { DestructibleMesh, FractureOptions } from '@dgreenheck/three-pinata'

// crumble (slice 2): architecture that breaks apart as the reader scrolls. method learned from the reference
// (PillarFractureShader: pre-fractured chunks, each vertex carries its chunk's pivot, the chunk turns about a hashed
// axis in the vertex shader; research/decode notes), written from scratch:
//   build   any closed mesh -> Voronoi chunks at load (three-pinata, MIT), merged into ONE geometry with per-vertex
//           `pivot` (chunk centre), `rank` (0..1 per chunk, its own timing) and `inner` (1 on the fresh crack faces)
//   animate look/hatch.js USE_CRUMBLE: progress 0..1 (scroll-scrubbed) lifts, spreads and turns each chunk, top first;
//           a small stepped jitter boils with the lines; the pointer pushes nearby chunks
// geometry is in metres and unskinned, so the hatch lines use the rest position (they stay on each chunk as it turns)

// a closed mesh for the fracture: positions only, welded (pinata needs watertight input: an unwelded cylinder
// warned "Failed to find final triangle" and left holes; welded: no warnings)
function closed(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone()
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k)
  const w = mergeVertices(g, 1e-5); w.computeVertexNormals(); return w
}

// fracture one closed geometry into `count` chunks; returns a merged geometry with pivot / rank / inner attributes
export function fracture(geometry, { count = 16, seed = 1, rankOffset = 0 } = {}) {
  const mesh = new DestructibleMesh(closed(geometry), new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial())
  const frags = mesh.fracture(new FractureOptions({ fragmentCount: count, seed, voronoiOptions: { mode: '3D' } }))
  const rnd = mulberry(seed * 7919 + 13)
  const parts = frags.map((f) => {
    const g = f.geometry.index ? f.geometry.toNonIndexed() : f.geometry.clone()
    // fragment-local -> object space (the fragment's position is its centre)
    g.translate(f.position.x, f.position.y, f.position.z)
    const n = g.attributes.position.count, pivot = new Float32Array(n * 3), rank = new Float32Array(n), inner = new Float32Array(n)
    const r = (rnd() + rankOffset) % 1
    for (let i = 0; i < n; i++) { pivot.set([f.position.x, f.position.y, f.position.z], i * 3); rank[i] = r }
    // group 1 = the new crack faces (pinata: materialIndex 1); toNonIndexed keeps group ranges as vertex ranges
    const src = f.geometry
    for (const grp of src.groups) if (grp.materialIndex === 1) for (let i = grp.start; i < grp.start + grp.count; i++) inner[i] = 1
    g.setAttribute('pivot', new THREE.BufferAttribute(pivot, 3))
    g.setAttribute('rank', new THREE.BufferAttribute(rank, 1))
    g.setAttribute('inner', new THREE.BufferAttribute(inner, 1))
    g.deleteAttribute('uv'); g.clearGroups()
    return g
  })
  mesh.geometry.dispose()
  return mergeGeometries(parts)
}

// a small deterministic PRNG, so a seed always gives the same crumble
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

// a fluted column with a block capital and base, built in code (metres). closed pieces, one per part
export function columnParts({ height = 3, radius = 0.32, flutes = 16 } = {}) {
  const shaft = new THREE.CylinderGeometry(radius * 0.92, radius, height, 48, 12)
  const p = shaft.attributes.position, v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const rr = Math.hypot(v.x, v.z)
    if (rr > radius * 0.5) {                                   // side wall only, caps keep their centres
      const a = Math.atan2(v.z, v.x), k = 1 - 0.05 * (0.5 + 0.5 * Math.cos(flutes * a))
      p.setXYZ(i, v.x * k, v.y, v.z * k)
    }
  }
  shaft.translate(0, height / 2 + 0.18, 0)
  const capital = new THREE.BoxGeometry(radius * 2.7, 0.24, radius * 2.7).translate(0, height + 0.18 + 0.12, 0)
  const base = new THREE.BoxGeometry(radius * 2.6, 0.18, radius * 2.6).translate(0, 0.09, 0)
  return { shaft, capital, base }
}

// a colonnade: `n` columns `gap` apart and a lintel across their tops, each piece fractured; returns one geometry
export function colonnade({ n = 3, gap = 1.6, height = 3, seed = 3, chunks = { shaft: 14, capital: 4, base: 3, lintel: 10 } } = {}) {
  const geos = []
  for (let c = 0; c < n; c++) {
    const x = (c - (n - 1) / 2) * gap, parts = columnParts({ height })
    for (const [k, g] of Object.entries(parts)) geos.push(fracture(g.translate(x, 0, 0), { count: chunks[k], seed: seed * 31 + c * 7 + k.length }))
  }
  const lintel = new THREE.BoxGeometry(gap * (n - 1) + 1.0, 0.36, 0.8).translate(0, height + 0.18 + 0.24 + 0.18, 0)
  geos.push(fracture(lintel, { count: chunks.lintel, seed: seed * 97 }))
  const g = mergeGeometries(geos)
  g.computeBoundingBox()
  return g
}

import * as THREE from 'three'

// smoke test: proves the renderer draws something that isn't the background
export const params = { speed: 0.4, background: '#f3f3f3' }

export function create() {
  const scene = new THREE.Scene()
  const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.32, 200, 32), new THREE.MeshNormalMaterial())
  scene.add(mesh)
  return {
    scene,
    update(t) {
      scene.background = new THREE.Color(params.background)
      mesh.rotation.set(t * params.speed, t * params.speed * 0.7, 0)
    },
  }
}

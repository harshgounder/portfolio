import { Pane } from 'tweakpane'

// one binding per param; presets are plain JSON of the params object
// ranges: optional { key: { min, max, step } | { options } } per param
export function createPanel(params, title, ranges = {}) {
  const pane = new Pane({ title })
  for (const key of Object.keys(params)) pane.addBinding(params, key, ranges[key])
  pane.addButton({ title: 'copy preset json' }).on('click', () => {
    const json = JSON.stringify(params, null, 2)
    navigator.clipboard?.writeText(json)
    console.log(json)
  })
  return pane
}

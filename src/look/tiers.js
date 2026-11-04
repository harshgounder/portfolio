// GPU quality tiers (upgrade list): an adaptive controller, not a GPU-name lookup. it watches the page's own frame
// times and steps quality down when frames run long. measured 2026-10-11 at 1280x800: GTX 1650 3.4-3.6 ms, AMD Vega
// iGPU 6-7 ms at dpr 1 but 19-23 ms at dpr 2, so pixel ratio is the big lever. @pmndrs/detect-gpu (6.0.25, MIT) can
// pick a starting tier from a benchmark database, but it downloads that database from a CDN at runtime; a kit page
// makes no third-party request on load, so it is left as an option.
//   window   median frame time over 90 frames, after 30 warm-up frames (shader compiles)
//   down     median > budget x 1.15  -> one tier down (and a fresh window)
//   up       median < budget x 0.5   -> one tier up, at most once (no flapping)
export const TIERS = [
  { name: 'low', dpr: 0.75, samples: 0, refraction: false, insets: false },
  { name: 'medium', dpr: 1, samples: 0, refraction: true, insets: true },
  { name: 'high', dpr: 1.5, samples: 4, refraction: true, insets: true },
  { name: 'full', dpr: 2, samples: 4, refraction: true, insets: true },
]

export function createTiers({ start = TIERS.length - 1, deviceDpr = 1, budgetMs = 20, onChange, warmup = 30, size = 90 } = {}) {
  let tier = start, seen = 0, raised = false
  const win = []
  const settings = (t = tier) => ({ ...TIERS[t], tier: t, dpr: Math.min(TIERS[t].dpr, deviceDpr) })
  function change(t, why) { tier = t; win.length = 0; onChange?.(settings(), why) }
  return {
    get tier() { return tier },
    settings,
    // one frame's duration in ms (the caller passes rAF deltas)
    update(ms) {
      if (++seen <= warmup || !(ms > 0) || ms > 1000) return                  // warm-up, and tab-switch gaps
      win.push(ms)
      if (win.length < size) return
      const m = [...win].sort((a, b) => a - b)[win.length >> 1]
      win.length = 0
      if (m > budgetMs * 1.15 && tier > 0) change(tier - 1, `median ${m.toFixed(1)} ms > ${(budgetMs * 1.15).toFixed(1)}`)
      else if (m < budgetMs * 0.5 && tier < TIERS.length - 1 && !raised) { raised = true; change(tier + 1, `median ${m.toFixed(1)} ms`) }
    },
  }
}

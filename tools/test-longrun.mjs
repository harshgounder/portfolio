// long-uptime test (2026-10-11, with review #11): the hand-drawn marks must look the same after the page has been
// open for hours. renders the fog beat at t = 1.5 s, 1 h and 100 h (frozen time, tools/shot.mjs) and compares
//   ground: ink share of the dashed ground strokes (old code: 8.9% -> 4.7% at 1 h -> 1.9% at 100 h, strokes vanish)
//   border: ink in the band of the rough top borders (old code: 0.57 -> 0.19 px per column at 1 h, wobble gone)
// pass: both stay within 0.6x-1.6x of the t = 1.5 s frame. usage: node tools/test-longrun.mjs
import { execFileSync } from 'node:child_process'
const root = new URL('..', import.meta.url).pathname
const ts = ['1.5', '3600', '360000']
for (const t of ts) execFileSync('node', ['tools/shot.mjs', '--scene', 'story', '--gpu', 'nvidia', '--t', t, '--scroll', '1400', '--out', `longrun-test-${t}`], { cwd: root, stdio: 'ignore' })
const py = `
import sys, numpy as np
from PIL import Image
ts = sys.argv[2:]; m = {}
for t in ts:
    a = np.asarray(Image.open(f'{sys.argv[1]}/shots/longrun-test-{t}.png').convert('L'), float)
    m[t] = (100 * float((a[640:770, 30:450] < 70).mean()), float((a[30:62, 40:1240] < 70).sum(0).mean()))
bad = []
for t in ts[1:]:
    for k, name in ((0, 'ground ink %'), (1, 'border px/col')):
        r = m[t][k] / max(1e-6, m[ts[0]][k])
        if not 0.6 <= r <= 1.6: bad.append(f'{name} at t={t}: {m[t][k]:.2f} vs {m[ts[0]][k]:.2f}')
print(' '.join(f't={t}: ground {g:.2f}% border {b:.2f}' for t, (g, b) in m.items()))
print('PASS marks unchanged after 1 h and 100 h' if not bad else 'FAIL ' + '; '.join(bad))
sys.exit(1 if bad else 0)
`
try { process.stdout.write(execFileSync('python3', ['-I', '-c', py, root, ...ts]).toString()) } catch (e) { process.stdout.write(e.stdout?.toString() ?? String(e)); process.exit(1) }

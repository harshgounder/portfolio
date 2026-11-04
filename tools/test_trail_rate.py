# frame-rate test for the ink trail's bleed + fade (look/inktrail.js, review #10). the shader step is mirrored in
# numpy (4-neighbour mix by uBleed, times uDecay) and a 1 s old stroke is compared at 30/60/120/144 Hz. this tests
# the update rule's maths, not the GPU. v1 (0.12 per frame) fails: at 120 Hz the stroke is gone (peak 0.41 < 0.5)
# while at 30 Hz it is still 0.64.  usage: python3 -I lab/tools/test_trail_rate.py   (exit 1 on failure)
import re, sys, os
import numpy as np
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../src/look/inktrail.js')).read()
# read the constants from the source, so the test follows the code (bleed expression and life)
m = re.search(r'uBleed\.value = Math\.min\(([\d.]+), ([\d.]+) \* dt \* 60\)', src)
life = float(re.search(r'life = ([\d.]+)', src).group(1))
if not m: print('FAIL inktrail.js has no dt-scaled uBleed'); sys.exit(1)
cap, base = float(m.group(1)), float(m.group(2))

def run(hz):
    dt = 1 / hz; v = np.zeros((80, 80)); v[38:42, :] = 1.0
    for _ in range(round(hz)):
        n = 0.25 * (np.roll(v, 1, 0) + np.roll(v, -1, 0) + np.roll(v, 1, 1) + np.roll(v, -1, 1))
        v = (v + (n - v) * min(cap, base * dt * 60)) * 0.5 ** (dt / life)
    c = v[:, 40]; return int((c > 0.5).sum()), float(c.max())

res = {hz: run(hz) for hz in (30, 60, 120, 144)}
peaks = [p for _, p in res.values()]; widths = {w for w, _ in res.values()}
ok = max(peaks) - min(peaks) < 0.01 and len(widths) == 1
print(f"{'PASS' if ok else 'FAIL'} trail after 1 s is the same at 30/60/120/144 Hz: " + ', '.join(f'{hz} Hz width {w} peak {p:.3f}' for hz, (w, p) in res.items()))
sys.exit(0 if ok else 1)

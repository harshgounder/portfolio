# self-test for the art gate (measure.py v2): builds synthetic images with KNOWN defects and asserts the gate
# catches each one, and passes the clean ones. these are the exact cases that broke measure.py v1 (2026-10-11).
# usage: python3 -I lab/tools/gate_selftest.py   (exit 1 if any case is judged wrong)
import json, sys, tempfile, os
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from measure import measure

W, H = 1280, 800
yy, xx = np.mgrid[0:H, 0:W]
fig = (abs(xx - 640) < 260) & (abs(yy - 400) < 300)

def lines(a, mask, period, width, ang):
    u = xx * np.cos(ang) + yy * np.sin(ang); a[mask & ((u % period) < width)] = 17

def vnoise(u, v, seed):
    g = np.random.default_rng(seed).random((600, 600))
    i, j = np.floor(u).astype(int) % 600, np.floor(v).astype(int) % 600; fu, fv = u - np.floor(u), v - np.floor(v)
    fu, fv = fu * fu * (3 - 2 * fu), fv * fv * (3 - 2 * fv)
    return g[i, j] * (1 - fu) * (1 - fv) + g[(i + 1) % 600, j] * fu * (1 - fv) + g[i, (j + 1) % 600] * (1 - fu) * fv + g[(i + 1) % 600, (j + 1) % 600] * fu * fv

cases = {}
a = np.full((H, W), 243.0); lines(a, fig, 4, 2, np.radians(20)); cases['clean_4px'] = a
a = np.full((H, W), 243.0); lines(a, fig, 4, 2, np.radians(20)); lines(a, fig & (xx < 640 - 260 + 104), 6, 2, np.radians(110)); cases['crosshatch_20pct'] = a
a = np.full((H, W), 243.0); coarse = fig & (xx < 640 - 260 + 364); lines(a, coarse, 16, 4, np.radians(20)); lines(a, fig & ~coarse, 4, 2, np.radians(20)); cases['coarse_70pct'] = a
a = np.full((H, W), 243.0); small = (abs(xx - 640) < 180) & (abs(yy - 400) < 220); lines(a, small, 4, 2, np.radians(20)); g = small & (yy < 400 - 220 + 132); a[g & (a > 200)] = 150; cases['grey_small_figure'] = a
a = np.full((H, W), 243.0); ang = np.radians(20); u = xx * np.cos(ang) + yy * np.sin(ang); v = -xx * np.sin(ang) + yy * np.cos(ang)
a[fig & ((u % 4) < 2) & (vnoise(v / 6 + 500, np.floor(u / 4) + 500, 3) > 0.45)] = 17; cases['noise_dashes_one_direction'] = a

# expected verdicts under the art bible section 4 gates (grey areas <= 6, largest crossing region <= 12,
# figure-only coarse_share <= 25)
expect = {'clean_4px': True, 'crosshatch_20pct': False, 'coarse_70pct': False, 'grey_small_figure': False, 'noise_dashes_one_direction': True}
ok_all = True
with tempfile.TemporaryDirectory() as d:
    for name, arr in cases.items():
        p = f'{d}/{name}.png'; Image.fromarray(arr.astype(np.uint8)).save(p)
        r = measure(p); h = r['hatch']
        passes = r['grey_of_marks'] <= 6 and h['crossing_largest_region'] <= 12 and (h['coarse_share'] or 0) <= 25
        right = passes == expect[name]; ok_all &= right
        print(f"{'OK  ' if right else 'BAD '} {name:28} gate={'pass' if passes else 'FAIL'} expected={'pass' if expect[name] else 'FAIL'} "
              f"grey_areas={r['grey_of_marks']} largest_cross={h['crossing_largest_region']} coarse={h['coarse_share']}")
print('gate self-test', 'PASSED' if ok_all else 'FAILED')
sys.exit(0 if ok_all else 1)

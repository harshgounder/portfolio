# measure a render against the D5 art rules (research/r2/D5-art-craft.md)
# usage: python3 -I tools/measure.py [--allow '#837872,...'] shot.png [more.png ...]
# v2 (2026-10-11, review of slice 1, every defect reproduced with independent images before fixing):
#   - crossing: crosshatch makes REGIONS; v1 counted isolated hits globally, so 20% of a figure crosshatched scored
#     18.8 and passed. now: the second peak must not be a dash sideband of the first ((kj -+ ki) perpendicular to
#     ki), and the gate reads crossing_cluster_pct = crossing patches with a crossing 4-neighbour (isolated hits
#     are text, edges). (a "same period" rule was tried first: it hid crosshatch whose families differ in period)
#   - spacing: v1's 33-sample profile could not see periods over ~10 px and dropped those patches silently
#     (70% of a figure at 16 px read [3.5, 4, 4.5]). now: period_px from the FFT peak of 48 px patches
#     (2-24 px) + coarse_share (period > 8 px); the profile still gives line width
#   - grey: v1 gated grey on the whole frame, diluted by paper (a figure 15% grey read 2.3%). now also
#     grey_of_marks = grey / (black + grey + colour + allowed) - independent of how much paper is around
#   - --allow: flat low-chroma tones the art bible allows (rule 7 skin) are not counted as grey
#   - float box sums (v1 truncated tensor terms to int), RGBA composited on paper
# prints, per image: black/white/grey/spot % of frame and of the figure box, solid-mass share of black,
# and hatch width / spacing from local structure-tensor patches, plus crossing_patches_pct.
# crossing_patches_pct calibration (2026-10-10): synthetic crosshatch 100%, synthetic parallel 0%,
# Santioni viewport frames 01-09 (no crosshatch) 4-22% from edge and type residue. gate: stay inside 0-22.
import json, sys
import numpy as np
from PIL import Image

def box(m, r):  # sum of m over a (2r+1)^2 box, via an integral image (float: tensor terms are fractional)
    p = np.pad(m.astype(np.float64), r + 1)
    c = p.cumsum(0).cumsum(1)
    k = 2 * r + 1
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k])[: m.shape[0], : m.shape[1]]

def otsu(v):
    h, e = np.histogram(v, 64)
    w = np.cumsum(h); mu = np.cumsum(h * e[:-1]); best, t = -1, v.mean()
    for i in range(1, 63):
        w0, w1 = w[i], w[-1] - w[i]
        if w0 == 0 or w1 == 0: continue
        m0, m1 = mu[i] / w0, (mu[-1] - mu[i]) / w1
        b = w0 * w1 * (m0 - m1) ** 2
        if b > best: best, t = b, e[i + 1]
    return t

def blur(a, r):
    return box(a, r) / (2 * r + 1) ** 2

def measure(path, allow=()):
    im = Image.open(path)
    if im.mode in ('RGBA', 'LA', 'P'):                     # transparent pixels are paper, not black
        bg = Image.new('RGBA', im.size, (243, 243, 243, 255)); im = Image.alpha_composite(bg, im.convert('RGBA'))
    a = np.asarray(im.convert('RGB')).astype(np.float64)
    L = a @ np.array([.2126, .7152, .0722]); C = a.max(2) - a.min(2)
    allowed = np.zeros(L.shape, bool)
    for hx in allow:
        rgb = np.array([int(hx.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)], float)
        allowed |= np.abs(a - rgb).max(2) <= 12
    spot = (C >= 40) & ~allowed; ach = ~spot & ~allowed
    black, white = ach & (L < 70), ach & (L > 200); grey = ach & ~black & ~white
    # grey AREAS (mush), not the 1 px anti-aliased edge of every crisp line: >= 6 of the 3x3 neighbours grey
    grey_core = grey & (box(grey, 1) >= 6)
    pct = lambda m, k: round(100 * float((m & k).sum()) / max(1, k.sum()), 1)
    frame = np.ones_like(black)
    ys, xs = np.nonzero(~white | spot)
    fig = np.zeros_like(black)
    if len(ys): fig[ys.min():ys.max() + 1, xs.min():xs.max() + 1] = True
    solid_core = box(black, 3) > 48.5
    solid = black & (box(solid_core, 3) > 0)

    # hatch: 24 px patches inside the figure, structure tensor -> direction + coherence,
    # then a luma profile across the lines through the patch centre
    gy, gx = np.gradient(L)
    jxx, jyy, jxy = blur(gx * gx, 3), blur(gy * gy, 3), blur(gx * gy, 3)
    widths, spacings, angles = [], [], []
    patch_spacing = []                                     # median spacing per measured patch (for coarse_share)
    tried = 0
    P, H = 24, 40                                          # v2: 81-sample profile sees spacing up to ~25 px (v1: 33)
    for y in range(H, L.shape[0] - H, P // 2):
        for x in range(H, L.shape[1] - H, P // 2):
            if not fig[y, x]: continue
            sl = np.s_[y - P // 2:y + P // 2, x - P // 2:x + P // 2]
            a_, b_, c_ = jxx[sl].sum(), jyy[sl].sum(), jxy[sl].sum()
            tr = a_ + b_
            if tr < 1e3: continue
            coh = np.sqrt((a_ - b_) ** 2 + 4 * c_ ** 2) / tr
            if coh < 0.5: continue
            th = 0.5 * np.arctan2(2 * c_, a_ - b_)           # gradient direction = across the lines
            t = np.arange(-H, H + 1)
            px, py = np.clip(np.round(x + t * np.cos(th)).astype(int), 0, L.shape[1] - 1), np.clip(np.round(y + t * np.sin(th)).astype(int), 0, L.shape[0] - 1)
            prof = L[py, px]
            if prof.max() - prof.min() < 80: continue
            tried += 1
            dark = prof < otsu(prof)
            runs, start = [], None
            for i, d in enumerate(dark):
                if d and start is None: start = i
                if not d and start is not None: runs.append((start, i)); start = None
            runs = [r for r in runs if r[0] > 0]                # drop runs touching the profile ends
            if len(runs) < 3 or any(r[1] - r[0] > 12 for r in runs): continue
            widths += [r[1] - r[0] for r in runs]
            cs = [(r[0] + r[1]) / 2 for r in runs]
            spacings += list(np.diff(cs)); patch_spacing.append(float(np.median(np.diff(cs))))
            angles.append((np.degrees(th) + 90) % 180)          # line direction
    q = lambda v: [round(float(np.percentile(v, p)), 1) for p in (25, 50, 75)] if len(v) else None

    # crossing hatch = two line families inside the SAME patch (different surfaces may differ, that's fine).
    # a crossing is a 2D lattice: two strong peaks in the patch spectrum at orientations >= 30 deg apart.
    # one family gives one peak (plus harmonics on the same orientation); stipple dots give no strong peak.
    # period of the hatch: FFT peak of 48 px patches (periods 2-24 px), so coarse hatch is seen too
    G = 48
    gwin = np.outer(np.hanning(G), np.hanning(G))
    gfy, gfx = np.meshgrid(np.fft.fftfreq(G), np.fft.fftfreq(G), indexing='ij'); grad = np.hypot(gfx, gfy)
    gband = (grad > 1 / 16.5) & (grad < 0.5)
    gori = np.degrees(np.arctan2(gfy, gfx)) % 180
    periods = []
    for y in range(G // 2, L.shape[0] - G // 2, G):
        for x in range(G // 2, L.shape[1] - G // 2, G):
            if not fig[y, x]: continue
            patch = L[y - G // 2:y + G // 2, x - G // 2:x + G // 2]
            dk = (patch < 131).mean()
            if patch.std() < 40 or not 0.12 < dk < 0.88: continue
            pw = np.abs(np.fft.fft2((patch - patch.mean()) * gwin)) ** 2 * gband
            k = pw.argmax()
            dd = np.abs(gori - gori.flat[k]); ray = (np.minimum(dd, 180 - dd) < 8) & gband
            if pw.flat[k] / (pw[ray].mean() + 1e-9) < 6: continue           # not a line texture (edges, shapes, text)
            periods.append(1 / grad.flat[k])

    F = 32
    win = np.outer(np.hanning(F), np.hanning(F))
    fy, fx = np.meshgrid(np.fft.fftfreq(F), np.fft.fftfreq(F), indexing='ij')
    rad = np.hypot(fx, fy)
    ori = np.degrees(np.arctan2(fy, fx)) % 180
    band = (rad > 1 / 11) & (rad < 0.5)                      # periods 2..11 px (hatch, not edges)
    textured = crossing = 0
    gy_n, gx_n = len(range(F // 2, L.shape[0] - F // 2, F)), len(range(F // 2, L.shape[1] - F // 2, F))
    cgrid = np.zeros((gy_n, gx_n), bool)
    for gi, y in enumerate(range(F // 2, L.shape[0] - F // 2, F)):
        for gj, x in enumerate(range(F // 2, L.shape[1] - F // 2, F)):
            if not fig[y, x]: continue
            patch = L[y - F // 2:y + F // 2, x - F // 2:x + F // 2]
            dk = (patch < 131).mean()  # 131 = midpoint of paper 243 and ink 20
            if patch.std() < 40 or not 0.15 < dk < 0.85: continue  # needs both ink and paper
            textured += 1
            pw = np.abs(np.fft.fft2((patch - patch.mean()) * win)) ** 2 * band
            i = pw.argmax()
            d = np.abs(ori - ori.flat[i]); d = np.minimum(d, 180 - d)
            j = (pw * (d >= 30)).argmax()
            # a hatch family is a sharp spike; a single edge spreads its energy along a whole ray
            def sharp(k):
                dd = np.abs(ori - ori.flat[k]); ray = (np.minimum(dd, 180 - dd) < 8) & band
                return pw.flat[k] / (pw[ray].mean() + 1e-9)
            # dashes along one family make SIDEBANDS: the main peak shifted along the lines, so (kj -+ ki) is
            # perpendicular to ki. a real second family can sit anywhere else (any period, any angle >= 30 deg)
            vi, vj = np.array([fx.flat[i], fy.flat[i]]), np.array([fx.flat[j], fy.flat[j]])
            def side(sg):
                d = vj - sg * vi; return abs(d @ vi) / (np.linalg.norm(d) * np.linalg.norm(vi) + 1e-12) < 0.2
            sideband = side(1) or side(-1)
            if pw.flat[j] >= 0.4 * pw.flat[i] and sharp(j) > 4 and not sideband: crossing += 1; cgrid[gi, gj] = True

    nb = np.zeros_like(cgrid)
    nb[1:] |= cgrid[:-1]; nb[:-1] |= cgrid[1:]; nb[:, 1:] |= cgrid[:, :-1]; nb[:, :-1] |= cgrid[:, 1:]
    clustered = int((cgrid & nb).sum())
    # largest 4-connected region of crossing patches (a crosshatched area is one region; false hits scatter)
    seen, largest = np.zeros_like(cgrid), 0
    for i0, j0 in zip(*np.nonzero(cgrid)):
        if seen[i0, j0]: continue
        stack, n = [(i0, j0)], 0; seen[i0, j0] = True
        while stack:
            i, j = stack.pop(); n += 1
            for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                a2, b2 = i + di, j + dj
                if 0 <= a2 < cgrid.shape[0] and 0 <= b2 < cgrid.shape[1] and cgrid[a2, b2] and not seen[a2, b2]: seen[a2, b2] = True; stack.append((a2, b2))
        largest = max(largest, n)
    marks = black | grey | spot | allowed
    pv = np.array(periods)
    return {
        'file': path,
        'grey_of_marks': round(100 * float(grey_core.sum()) / max(1, marks.sum()), 1),
        'frame': {k: pct(m, frame) for k, m in [('black', black), ('white', white), ('grey', grey), ('spot', spot)]},
        'figure_box': {k: pct(m, fig) for k, m in [('black', black), ('white', white), ('grey', grey), ('spot', spot)]},
        'solid_share_of_black': round(100 * float(solid.sum()) / max(1, black.sum()), 1),
        'hatch': {'patches': len(angles), 'width_px_q25_50_75': q(widths), 'spacing_px_q25_50_75': q(spacings),
                  'crossing_patches_pct': round(100 * crossing / max(1, textured), 1), 'textured_patches': textured,
                  'crossing_cluster_pct': round(100 * clustered / max(1, textured), 1), 'crossing_largest_region': largest,
                  'period_px_q25_50_75': q(pv) if len(pv) else None,
                  'coarse_share': round(100 * float((np.array(patch_spacing) > 8).mean()), 1) if patch_spacing else None,
                  'measured_of_tried_pct': round(100 * len(patch_spacing) / max(1, tried), 1)},
    }

if __name__ == '__main__':
    args, allow = sys.argv[1:], ()
    if args[:1] == ['--allow']: allow, args = tuple(h for h in args[1].split(',') if h), args[2:]
    for f in args:
        print(json.dumps(measure(f, allow)))

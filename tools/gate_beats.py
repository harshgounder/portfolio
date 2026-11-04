# art gate on every story beat + figure-only renders (art/ART-BIBLE.md sections 1, 2, 4; measure.py v2)
# usage: python3 -I lab/tools/gate_beats.py SHOTS_DIR FIGURE.png [FIGURE.png ...] > art/GATE-RESULTS.md
#   SHOTS_DIR = output of `node tools/beats.mjs --at 0.1,0.5,0.9 --out <dir>` (1280x800 page screenshots)
# every frame is measured INSIDE the panel (the page has paper margins; art bible 2: title plate measured in-panel).
# bands come from the art bible; where the bible gives a single value ("about 67%") the tolerance used here is
# written next to it, so it is a choice you can see, not a number pretending to be measured.
# exit 1 if any hard check fails (grey areas, crosshatch, a regime band, figure spacing / coarse share).
import sys, os, json, tempfile
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from measure import measure

PANEL = (48, 84, 1232, 752)              # .comic .panel inset 84px 48px 48px 48px at 1280x800 (look/panel.css)
ALLOW = ('#b09c76', '#9c8761')           # rule 7 tan: in the material, and as it reads on screen
# beat -> list of (label, value getter, lo, hi, which frames, note)
B = lambda r: r['frame']['black']
S = lambda r: r['frame']['spot']
SOLID = lambda r: r['solid_share_of_black']
BANDS = {
    'title': [('black in-panel', B, 62, 72, 'all', 'bible: "about 67%"; tolerance +-5 is this tool\'s choice')],
    'fog':   [('black (calm)', B, 25, 33, 'all', 'regime a calm 25-33'), ('colour', S, 0, 8, 'all', 'regime a colour 0-8')],
    'night': [('black (night plate)', B, 88, 100, 'last', 'night plate 88-100 once the gouges have closed')],
    'red':   [('red ground', S, 50, 90, 'all', 'regime c ground 50-90')],
    'crumble': [('red ground', S, 50, 90, 'all', 'regime c ground 50-90 (reference PillarCrumble: red sky 36-71)')],
    'inks':  [('accent on the product', S, 0.2, 2.4, 'all', 'colour arc step 1, the accent on the product: reference DrinkSelection 0.2-2.4 (research/m1/MOTION.md 4)'),
              ('black', B, 5, 31, 'all', 'reference DrinkSelection black 5-31')],
    'map':   [('solid share of black', SOLID, 70, 91, 'all', 'deliberate engraved band 77-79 (bible 2: 85-91 for figures); floor 70 is this tool\'s choice')],
}

def run(shots, figures):
    rows, bad = [], []
    beats = sorted({f.split('-')[0] for f in os.listdir(shots) if f.endswith('.png') and f != 'sheet.png'},
                   key=lambda b: list(BANDS).index(b) if b in BANDS else 99)
    with tempfile.TemporaryDirectory() as d:
        for b in beats:
            frames = sorted(f for f in os.listdir(shots) if f.startswith(b + '-') and f.endswith('.png'))
            for i, f in enumerate(frames):
                p = f'{d}/{f}'; Image.open(f'{shots}/{f}').convert('RGB').crop(PANEL).save(p)
                r = measure(p, ALLOW); h = r['hatch']
                checks = [('grey areas', r['grey_of_marks'], 0, 6), ('crosshatch region', h['crossing_largest_region'], 0, 12)]
                for label, get, lo, hi, which, _ in BANDS.get(b, []):
                    if which == 'all' or (which == 'last' and i == len(frames) - 1): checks.append((label, get(r), lo, hi))
                for label, v, lo, hi in checks:
                    ok = v is not None and lo <= v <= hi
                    rows.append((b, f.rsplit('-', 1)[1][:-4], label, v, f'{lo}-{hi}', ok))
                    if not ok: bad.append(f'{f} {label} {v}')
                rows.append((b, f.rsplit('-', 1)[1][:-4], 'info: black / white / spot / solid', f"{r['frame']['black']} / {r['frame']['white']} / {r['frame']['spot']} / {r['solid_share_of_black']}", '', None))
    for f in figures:
        r = measure(f, ALLOW); h = r['hatch']
        w, sp = h['width_px_q25_50_75'], h['spacing_px_q25_50_75']
        checks = [('grey areas', r['grey_of_marks'], 0, 6), ('crosshatch region', h['crossing_largest_region'], 0, 12),
                  ('coarse share', h['coarse_share'], 0, 25), ('median spacing px', sp[1] if sp else None, 3.5, 5.5)]
        for label, v, lo, hi in checks:
            ok = v is not None and lo <= v <= hi
            rows.append(('figure', os.path.basename(f), label, v, f'{lo}-{hi}', ok))
            if not ok: bad.append(f'{f} {label} {v}')
        rows.append(('figure', os.path.basename(f), 'info: width / spacing q25-50-75', f'{w} / {sp}', '', None))
    return rows, bad

if __name__ == '__main__':
    rows, bad = run(sys.argv[1], sys.argv[2:])
    print('| beat | at | check | value | band | verdict |\n|---|---|---|---|---|---|')
    for b, at, label, v, band, ok in rows:
        print(f"| {b} | {at} | {label} | {v} | {band} | {'' if ok is None else ('PASS' if ok else '**FAIL**')} |")
    print('\nfigure median spacing band 3.5-5.5 px: rule 4 says 4-4.5 (fine) and 7.5-8.5 (broad, sleeves); the band is this tool\'s choice around the fine value. coarse share <= 25 is the bible gate.')
    print('\nband notes: ' + '; '.join(f'{b}: {n}' for b, bl in BANDS.items() for (_, _, _, _, _, n) in bl))
    print(f"\n{'PASS all hard checks' if not bad else 'FAIL ' + str(len(bad)) + ': ' + '; '.join(bad)}")
    sys.exit(1 if bad else 0)

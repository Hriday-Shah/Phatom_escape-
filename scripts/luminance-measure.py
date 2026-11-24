#!/usr/bin/env python3
"""Measure self-shadow fraction the way QA report-12 / selfshadow12.py does."""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/pe-luminance')
TAG = sys.argv[2] if len(sys.argv) > 2 else 'run'
LIMIT = float(sys.argv[3] if len(sys.argv) > 3 else 8.0)
meta = json.loads((OUT / f'selfshadow-meta-{TAG}.json').read_text())
R = meta.get('radius') or 208
cache = {}

def Lof(p):
    if p not in cache:
        I = np.asarray(Image.open(p).convert('RGB')).astype(float)
        cache[p] = 0.2126 * I[..., 0] + 0.7152 * I[..., 1] + 0.0722 * I[..., 2]
    return cache[p]

fails = 0
print(f"{'view':8} {'unit':24} {'self-shadow %':>14}  result")
for v in meta['views']:
    Li = Lof(v['light']['file'])
    Ni = Lof(v['nolight']['file'])
    H, W = Li.shape
    info = v['light']['info']
    px, py = info['px'], info['py']
    for u in info['units']:
        d = u['dev']
        x0, y0, x1, y1 = int(d['x0']), int(d['y0']), int(d['x1']), int(d['y1'])
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, W), min(y1, H)
        if x1 - x0 < 4 or y1 - y0 < 4:
            print(f"{v['tag']:8} {u['id']:24} rect too small {x0,y0,x1,y1}")
            fails += 1
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1]
        wx = u['x'] + 2 + (xx + 0.5 - d['x0']) / (d['x1'] - d['x0']) * (u['w'] - 4)
        wy = u['y'] + 2 + (yy + 0.5 - d['y0']) / (d['y1'] - d['y0']) * (u['h'] - 4)
        near = np.hypot(wx - px, wy - py) < 0.6 * R
        l = Li[y0:y1, x0:x1]
        n = Ni[y0:y1, x0:x1]
        ok = near & (n > 25)
        if ok.sum() < 50:
            print(f"{v['tag']:8} {u['id']:24} too few sample px ({int(ok.sum())}) rect={x0,y0,x1,y1}")
            fails += 1
            continue
        frac = float(((l < 0.2 * n) & ok).sum() / ok.sum() * 100)
        flag = frac <= LIMIT
        print(f"{v['tag']:8} {u['id']:24} {frac:13.1f}%  {'PASS' if flag else 'FAIL'}  n={int(ok.sum())}")
        if not flag:
            fails += 1

if fails:
    print(f'{fails} FAILED')
    sys.exit(1)
print('ALL PASS')

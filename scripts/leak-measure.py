#!/usr/bin/env python3
"""Leak scan: lit pixels behind a wall / locked door (QA report-13 / leak13.py)."""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

# House walls + main door; bedroom door is added unless TAG is 'u' (unlock).
WALLS = [
  [70,140,360,10],[70,140,10,240],[70,370,240,10],[390,370,40,10],[420,140,10,240],
  [150,380,10,110],[150,480,140,10],[380,480,50,10],[420,380,10,6],[420,484,10,6],
  [430,100,10,286],[430,484,10,6],[430,100,110,10],[540,100,160,10],[700,100,110,10],
  [800,100,10,140],[800,300,10,190],[430,480,370,10],
  [810,100,160,10],[810,100,10,130],[810,220,90,10],[950,220,20,10],[960,100,10,130],
  [810,230,10,10],[810,300,10,10],[810,300,20,10],[890,300,80,10],[960,230,10,80],
  [810,310,20,10],[890,310,200,10],[810,310,10,300],[810,600,280,10],[1080,310,10,300],
]
MAIN_DOOR = [290, 484, 90, 14]
BED_DOOR = [310, 374, 80, 12]
ROOMS = {
  'bedroom': [70,140,360,240], 'entrance': [150,380,280,110],
  'living': [430,100,380,200], 'dining': [430,300,380,190],
  'bathroom': [810,100,160,130], 'foyer': [810,230,160,80], 'kitchen': [810,310,280,300],
}

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/pe-leak')
TAG = sys.argv[2] if len(sys.argv) > 2 else 'u'
LIMIT = float(sys.argv[3] if len(sys.argv) > 3 else 200)
occ = WALLS + [MAIN_DOOR] + ([] if TAG == 'u' else [BED_DOOR])

def seg_hits(x0, y0, x1, y1, r, shrink=1.0):
  rx, ry, rw, rh = r[0]+shrink, r[1]+shrink, r[2]-2*shrink, r[3]-2*shrink
  if rw <= 0 or rh <= 0: return np.zeros_like(x1, dtype=bool)
  dx=x1-x0; dy=y1-y0
  t0=np.zeros_like(x1); t1=np.ones_like(x1); ok=np.ones_like(x1, dtype=bool)
  for p, q in [(-dx, x0-rx), (dx, rx+rw-x0), (-dy, y0-ry), (dy, ry+rh-y0)]:
    zero = (p == 0)
    ok &= ~(zero & (q < 0))
    with np.errstate(divide='ignore', invalid='ignore'):
      t = np.where(zero, 0, q / np.where(zero, 1, p))
    neg = (p < 0) & ~zero; pos = (p > 0) & ~zero
    t0 = np.where(neg & (t > t0), t, t0); t1 = np.where(pos & (t < t1), t, t1)
  return ok & (t0 <= t1)

meta = json.loads((OUT / f'meta_{TAG}.json').read_text())
tot = 0; fails = 0
print(f"{'pos':16} {'lit px':>8} {'LEAK px':>8}  rooms")
for m in meta:
  x, y = m['x'], m['y']
  a = m['ma']
  L = np.asarray(Image.open(OUT / f'{TAG}_{x}_{y}_L.png').convert('RGB')).astype(float)
  N = np.asarray(Image.open(OUT / f'{TAG}_{x}_{y}_N.png').convert('RGB')).astype(float)
  lum = lambda I: 0.2126*I[...,0] + 0.7152*I[...,1] + 0.0722*I[...,2]
  l, n = lum(L), lum(N)
  H, W = l.shape
  # Prefer the in-page canvas rect (phone shell) when present; else cam viewport.
  canv = a.get('canvas') or {}
  dpr = float(canv.get('dpr') or 1)
  camx, camy, camw, camh = a['vp']
  z = a['zoom']; wx0, wy0 = a['wv'][0], a['wv'][1]
  sx = (canv.get('w', W) / canv.get('cw', W)) * dpr  # screenshot px per canvas px
  sy = (canv.get('h', H) / canv.get('ch', H)) * dpr
  vx = canv.get('left', 0) * dpr + camx * sx
  vy = canv.get('top', 0) * dpr + camy * sy
  vw, vh = camw * sx, camh * sy
  cy, cx = np.mgrid[0:H, 0:W]
  inside = (cx >= vx) & (cx < vx + vw) & (cy >= vy) & (cy < vy + vh)
  inside &= cy >= vy + 70 * dpr
  wx = wx0 + (cx - vx + 0.5) / (z * sx)
  wy = wy0 + (cy - vy + 0.5) / (z * sy)
  lit = inside & (n > 25) & (l > n * 0.25)
  px, py = a['px'], a['py']
  onwall = np.zeros_like(lit)
  for r in occ:
    onwall |= (wx >= r[0]-2) & (wx <= r[0]+r[2]+2) & (wy >= r[1]-2) & (wy <= r[1]+r[3]+2)
  cand = lit & ~onwall
  X, Y = wx[cand], wy[cand]
  blocked = np.zeros(X.shape, dtype=bool)
  for r in occ:
    blocked |= seg_hits(px, py, X, Y, r)
  n_leak = int(blocked.sum())
  tot += n_leak
  where = {}
  leakx, leaky = X[blocked], Y[blocked]
  for k, r in ROOMS.items():
    c = int(((leakx > r[0]) & (leakx < r[0]+r[2]) & (leaky > r[1]) & (leaky < r[1]+r[3])).sum()) if n_leak else 0
    if c: where[k] = c
  flag = n_leak <= LIMIT
  if not flag: fails += 1
  print(f'({x},{y})'.ljust(16), f'{int(lit.sum()):8d} {n_leak:8d}  {"PASS" if flag else "FAIL"}  {where}')
  if n_leak:
    img = L.copy().astype(np.uint8)
    mask = np.zeros(l.shape, bool)
    idx = np.where(cand)
    mask[idx[0][blocked], idx[1][blocked]] = True
    img[mask] = [255, 0, 0]
    Image.fromarray(img).save(OUT / f'{TAG}_{x}_{y}_LEAK.png')

print('total leak px', tot)
if fails:
  print(f'{fails} of {len(meta)} positions FAILED (limit {LIMIT} px)')
  sys.exit(1)
print('ALL PASS')

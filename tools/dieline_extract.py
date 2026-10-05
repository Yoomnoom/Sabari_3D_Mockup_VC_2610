# 개발용(앱에는 넣지 않음): 인쇄소 칼선(.ai, PDF 호환)에서 패널·날개 좌표를 mm(아트보드 좌상단 원점)로 뽑는다.
# 사용: python tools/dieline_extract.py <ai 파일> [출력 json]
import json, sys, math
import pymupdf

PT = 25.4 / 72
src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else None
doc = pymupdf.open(src)
pg = doc[0]
art = (round(pg.rect.width * PT, 2), round(pg.rect.height * PT, 2))
segs = []  # (type, points[mm])
for d in pg.get_drawings():
    for it in d['items']:
        k = it[0]
        if k == 'l': pts = [it[1], it[2]]
        elif k == 'c': pts = [it[1], it[2], it[3], it[4]]
        elif k == 're': r = it[1]; pts = [pymupdf.Point(r.x0, r.y0), pymupdf.Point(r.x1, r.y0), pymupdf.Point(r.x1, r.y1), pymupdf.Point(r.x0, r.y1), pymupdf.Point(r.x0, r.y0)]
        elif k == 'qu': q = it[1]; pts = [q.ul, q.ur, q.lr, q.ll, q.ul]
        else: continue
        segs.append((k, [(p.x * PT, p.y * PT) for p in pts]))

# 끝점이 닿는 선분끼리 묶어 연결 성분(= 한 덩어리의 칼선)을 만든다
def key(p): return (round(p[0], 2), round(p[1], 2))
parent = list(range(len(segs)))
def find(a):
    while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
    return a
ends = {}
for i, (_, pts) in enumerate(segs):
    for p in (pts[0], pts[-1]):
        ends.setdefault(key(p), []).append(i)
for lst in ends.values():
    for j in lst[1:]: parent[find(j)] = find(lst[0])
comps = {}
for i in range(len(segs)): comps.setdefault(find(i), []).append(i)
rows = []
for idx in comps.values():
    xs = [p[0] for i in idx for p in segs[i][1]]; ys = [p[1] for i in idx for p in segs[i][1]]
    rows.append({'segments': len(idx), 'x0': round(min(xs), 2), 'y0': round(min(ys), 2), 'x1': round(max(xs), 2), 'y1': round(max(ys), 2), 'w': round(max(xs) - min(xs), 2), 'h': round(max(ys) - min(ys), 2)})
rows.sort(key=lambda r: (r['x0'], r['y0']))
res = {'artboardMm': art, 'segmentCount': len(segs), 'components': rows}
print(json.dumps(res, ensure_ascii=False, indent=1))
if out: json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

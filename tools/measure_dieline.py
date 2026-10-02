"""inputs/ 의 .ai(PDF 호환) 칼선 샘플에서 전개도 치수를 읽는다 (PyMuPDF).
사용법: python tools/measure_dieline.py [칼선파일] → verification/dieline_sample_measured.json

두 전개도(왼쪽 = 뚜껑 "상", 오른쪽 = 몸통 "하")마다:
  - 중앙 패널(싸바리지 면): 접이선으로 둘러싸인 가장 큰 직사각형의 길이
  - 날개 깊이: 패널 가장자리 ~ 날개 접이선
  - 접어 넣는 폭(tuck): 날개 접이선 ~ 바깥 가장자리
  - 전체 바깥 크기
제조 정밀도를 보증하지 않는다. 앱의 가정값과 비교하는 용도다.
"""
import json
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
src = Path(sys.argv[1]) if len(sys.argv) > 1 else next((ROOT / "inputs").glob("*.ai"))
F = 25.4 / 72  # pt -> mm

doc = pymupdf.open(src)
items = doc[0].get_drawings()[0]["items"]
V, H = [], []  # (좌표, 시작, 끝)
for it in items:
    if it[0] != "l":
        continue
    a, b = it[1], it[2]
    if abs(a.x - b.x) < 0.01:
        V.append((a.x * F, min(a.y, b.y) * F, max(a.y, b.y) * F))
    if abs(a.y - b.y) < 0.01:
        H.append((a.y * F, min(a.x, b.x) * F, max(a.x, b.x) * F))


def measure(x_lo, x_hi):
    """x_lo~x_hi 범위의 전개도 하나를 분석한다."""
    vs = [(x, y0, y1) for x, y0, y1 in V if x_lo <= x <= x_hi and (y1 - y0) > 100]
    hs = [(y, x0, x1) for y, x0, x1 in H if x_lo <= x0 and x1 <= x_hi and (x1 - x0) > 80]
    xs = sorted({round(x, 1) for x, _, _ in vs})
    ys = sorted({round(y, 1) for y, _, _ in hs})
    # 가로(수평선) 4개: 바깥(위), 접이선(위), 접이선(아래), 바깥(아래)
    ys4 = ys
    # 패널 세로 범위 = 가장 긴 수직선(패널 좌우 가장자리)의 y 범위
    longest = max(vs, key=lambda t: t[2] - t[1])
    panel_y0, panel_y1 = longest[1], longest[2]
    # 패널 좌우 가장자리 x: 길이가 패널 높이와 같은 수직선 두 개
    edge_x = sorted({round(x, 1) for x, y0, y1 in vs if abs((y1 - y0) - (panel_y1 - panel_y0)) < 1.0})
    # 세로 방향 접이선(좌우 날개): 패널 높이와 같은 수직선 중 바깥쪽 2쌍
    out = {
        "panel_height_mm": round(panel_y1 - panel_y0, 1),
        "vertical_lines_x_mm": xs,
        "horizontal_lines_y_mm": ys4,
    }
    # 수평선 중 패널 위·아래 가장자리 y = panel_y0 / panel_y1 에 가장 가까운 선들의 폭 = 패널 폭
    def nearest(y):
        return min(hs, key=lambda t: abs(t[0] - y))
    top_edge = nearest(panel_y0)
    out["panel_width_mm_from_horizontal_near_top_edge"] = round(top_edge[2] - top_edge[1], 1)
    return out, (panel_y0, panel_y1), vs, hs


result = {"source": src.name, "units": "mm", "assumption_note": "측정값은 칼선 샘플 한 건 기준이며 제조 규격이 아님"}
for name, lo, hi in (("lid_left_drawing", 0, 300), ("base_right_drawing", 300, 600)):
    info, (py0, py1), vs, hs = measure(lo, hi)
    # 날개 접이선(위/아래): 패널 위·아래 가장자리에서 가장 가까운 수평선(폭이 패널 폭 근처)이 아니라 바깥쪽 선
    h_sorted = sorted({round(y, 1) for y, _, _ in hs})
    # 수평선은 4개(바깥 위, 접이선 위, 접이선 아래, 바깥 아래)
    if len(h_sorted) >= 4:
        outer_t, fold_t, fold_b, outer_b = h_sorted[0], h_sorted[1], h_sorted[-2], h_sorted[-1]
        info["wing_depth_top_mm"] = round(py0 - fold_t, 1)
        info["wing_depth_bottom_mm"] = round(fold_b - py1, 1)
        info["tuck_top_mm"] = round(fold_t - outer_t, 1)
        info["tuck_bottom_mm"] = round(outer_b - fold_b, 1)
        info["outer_height_mm"] = round(outer_b - outer_t, 1)
    # 좌우 날개: 패널 높이와 같은 길이의 수직선들 (바깥, 접이선) — 길이가 다른 선(패널 가장자리 포함)은 y범위가 같다
    v_sorted = sorted({round(x, 1) for x, y0, y1 in vs if abs((y1 - y0) - (py1 - py0)) < 3.0})
    info["side_vertical_candidates_x_mm"] = v_sorted
    result[name] = info

(ROOT / "verification").mkdir(exist_ok=True)
out = ROOT / "verification" / "dieline_sample_measured.json"
out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(result, ensure_ascii=False, indent=2))

"""앱이 기본값으로 만든 칼선 레이아웃을 inputs/ 의 .ai 칼선 샘플 측정값과 수치로 대조한다.
사전 실행: python tools/measure_dieline.py  (샘플 측정 → verification/dieline_sample_measured.json)
          cd frontend && npx vitest run     (앱 레이아웃 → verification/dieline_default_layout.json)
사용법:  python tools/compare_dieline.py → verification/dieline_compare.json 과 표 출력

오차 기준(mm)
  패널 가로·세로, 날개 깊이: ±0.05  (샘플 값이 소수 첫째 자리까지 읽히므로 사실상 일치해야 한다)
  외곽 가로(좌우 날개 접어 넣는 폭 19.3 이 샘플과 같다):        ±0.1
  외곽 세로: ±1.1  ← 샘플은 위·아래 날개의 접어 넣는 폭이 19.8mm 이고 좌우 날개는 19.3mm 인데,
                     앱은 사용자가 지정한 단일 값(19.3)을 쓰므로 위·아래에서 0.5mm 씩, 합 1.0mm 차이가 난다.
이 대조는 칼선 샘플 한 건의 치수와 맞는지를 보는 것이며 제조 규격을 보증하지 않는다.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
V = ROOT / "verification"
meas = json.loads((V / "dieline_sample_measured.json").read_text(encoding="utf-8"))
app = json.loads((V / "dieline_default_layout.json").read_text(encoding="utf-8"))

TOL = {"panel": 0.05, "depth": 0.05, "width": 0.1, "height": 1.1}
rows = []


def add(kind, name, sample, appv, tol, note=""):
    diff = round(appv - sample, 3)
    rows.append({"전개도": kind, "항목": name, "샘플(.ai)": sample, "앱(기본값)": round(appv, 3), "차이": diff, "허용오차": tol, "통과": abs(diff) <= tol + 1e-9, "비고": note})


for kind, key, sample in (("뚜껑", "lid", meas["lid_left_drawing"]), ("몸통", "base", meas["base_right_drawing"])):
    a = app[key]
    add(kind, "패널 짧은 변(가로)", sample["panel_width_mm_from_horizontal_near_top_edge"], a["panel"]["w"], TOL["panel"])
    add(kind, "패널 긴 변(세로)", sample["panel_height_mm"], a["panel"]["h"], TOL["panel"])
    add(kind, "날개 깊이(위)", sample["wing_depth_top_mm"], a["depth"], TOL["depth"])
    add(kind, "날개 깊이(아래)", sample["wing_depth_bottom_mm"], a["depth"], TOL["depth"])
    if key == "lid":  # 몸통 샘플은 좌우 날개선이 읽히지 않아(몸통 도면 한쪽만 검출) 가로 외곽은 뚜껑에서만 비교한다
        side = sample["side_vertical_candidates_x_mm"]
        sample_w = round(side[-1] - side[0], 1)
        add(kind, "외곽 가로(좌우 날개 포함)", sample_w, a["cutWidth"], TOL["width"])
    add(kind, "외곽 세로(위·아래 날개 포함)", sample["outer_height_mm"], a["cutHeight"], TOL["height"],
        "샘플 위·아래 접어 넣는 폭 19.8 vs 앱 단일값 19.3 → 합 1.0mm 차이")

out = {"tolerance_mm": TOL, "source": meas["source"], "all_pass": all(r["통과"] for r in rows), "rows": rows}
(V / "dieline_compare.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"{'전개도':<4}{'항목':<22}{'샘플':>8}{'앱':>9}{'차이':>8}{'허용':>7}  통과")
for r in rows:
    print(f"{r['전개도']:<4}{r['항목']:<20}{r['샘플(.ai)']:>8}{r['앱(기본값)']:>9}{r['차이']:>8}{r['허용오차']:>7}  {'OK' if r['통과'] else 'FAIL'}")
print("전체:", "통과" if out["all_pass"] else "실패")
sys.exit(0 if out["all_pass"] else 1)

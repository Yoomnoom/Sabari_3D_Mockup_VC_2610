# 작업 32A: verification/ui-info/measure_before.json 과 src 문구에서 inventory.md 를 만든다(읽기 전용 조사 결과물).
import json, re, io, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
m = json.loads((ROOT / 'verification/ui-info/measure_before.json').read_text(encoding='utf-8'))
rows = m['desktop']['hints']
SAFETY = ['제조', '삭제', '비율', '4배', '외부 GLB', '재단 여분', '임시저장', '제거']


def classify(h):
    t, i = h['text'], h['id']
    if i in ('msg', 'extGlbBanner', 'draftToast', 'ratioBanner', 'openNotice', 'splitWarn', 'importDimsWarn', 'saveNameErr') or 'err' in h['cls'].split() or '쓸 수 없습니다' in t:
        return 'c 조건부 안내·경고'
    if i in ('dielineInfo', 'glbInfo', 'glbInfoView', 'bgImageInfo', 'draftInfo', 'faceSize', 'fileInfo', 'dimsDerived', 'axisGuideState', 'verLine', 'splitPanHint') or h['len'] <= 14:
        return 'd 상태 표시'
    if h['len'] > 60:
        return 'b 상세 설명'
    return 'a 핵심 안내'


def propose(h, cls):
    t = h['text']
    safe = any(k in t for k in SAFETY)
    if cls.startswith('b'):
        base = '첫 문장만 항상 노출(1줄) + 나머지는 "자세히 보기"' if safe else '"자세히 보기"(제목 옆 ? 하나로 묶기)'
        return base + (' · 안전 관련: 원문 유지(요약 1~2줄 + 상세에 원문 전체)' if safe else '')
    if cls.startswith('a'):
        return '항상 노출 유지(최대 1~2줄, 대비 4.5:1)' + (' · 안전 관련: 원문 유지' if safe else '')
    if cls.startswith('c'):
        return '해당 상황에서만 표시(현재와 같음), 4단계 색+아이콘+글자 적용'
    return '상태 배지/한 줄 상태값 유지'


out = io.StringIO()
w = out.write
w('# UI 설명문·안내·경고 문구 전수 조사 (작업 32A)\n\n')
w('> 조사만 했고 코드·스타일·문구는 바꾸지 않았다. 측정: `tools/ui_info_inventory.mjs`(Playwright, 합성 상태만) → `verification/ui-info/measure_before.json`, 표 생성: `tools/ui_info_report.py`. 노출 열: 항상 = 해당 탭을 열면 바로 보임, 접힘/조건부 = hidden 속성·닫힌 details 안.\n\n')
w('## 1. 안내 문구 목록 (index.html 정적 + 실제 화면에서 수집, %d개)\n\n' % len(rows))
w('| ID | 화면 | 셀렉터 | 현재 문구(원문) | 글자 | 노출 | 분류 | 제안 노출 | 의미 약화 우려 |\n|---|---|---|---|---|---|---|---|---|\n')
counts = {}
for n, h in enumerate(rows, 1):
    c = classify(h)
    counts[c] = counts.get(c, 0) + 1
    sel = ('#' + h['id']) if h['id'] else ('.' + h['cls'].split()[0] if h['cls'] else 'p')
    exp = '항상' if h['visible'] else ('조건부/접힘')
    risk = '있음(안전)' if any(k in h['text'] for k in SAFETY) and c.startswith('b') else '-'
    w(f"| U{n:02d} | {h['where']} | `{sel}` | {h['text'].replace('|', '/')} | {h['len']} | {exp} | {c} | {propose(h, c)} | {risk} |\n")
w('\n분류별 개수: ' + ', '.join(f'{k} {v}개' for k, v in sorted(counts.items())) + '\n\n')

w('## 2. 대화상자·메뉴·알림에서 수집한 문구 (모바일 포함 동일 DOM)\n\n')
for name, rs in m['desktop']['dialogs'].items():
    if not rs: continue
    w(f'- **#{name}** ({len(rs)}개): ' + ' / '.join(r[:60] for r in rs[:8]) + ('…' if len(rs) > 8 else '') + '\n')

w('\n## 3. 코드 안 알림 문구 (msg/infoDialog/confirmDialog 호출)\n\n')
n = 0
for f in sorted((ROOT / 'frontend/src').glob('*.ts')):
    for i, line in enumerate(f.read_text(encoding='utf-8').split('\n'), 1):
        if re.search(r"\b(msg|infoDialog|confirmDialog|notify\w*)\(", line) and re.search(r'[가-힣]', line):
            t = re.sub(r'\s+', ' ', line.strip())[:150]
            n += 1
            w(f'- `{f.name}:{i}` {t}\n')
w(f'\n(총 {n}줄. 대부분 조건부 알림이며 현재와 같은 노출을 유지한다.)\n\n')

w('## 4. 현재 측정\n\n| 화면 | 탭 | 패널 높이(px) | 첫 화면 컨트롤 수 | 주황 채움 버튼 |\n|---|---|---|---|---|\n')
for vp, vpn in [('desktop', '1366×768'), ('tablet', '1024×768'), ('mobile', '390×844')]:
    for t, tn in [('tabDesign', '디자인'), ('tabBox', '박스'), ('tabView', '보기'), ('tabExport', '내보내기')]:
        d = m[vp]['tabs'].get(t)
        if d: w(f"| {vpn} | {tn} | {d['scrollH']} | {d['controlsInFirstScreen']} | {', '.join(d['primaryButtons']) or '없음'} |\n")
by = {}
for h in rows:
    if h['visible']:
        k = h['where']; a = by.setdefault(k, [0, 0, 0]); a[0] += 1; a[1] += h['len']; a[2] += h['lines']
w('\n항상 노출되는 설명 문구(탭별, 줄 수는 28자/줄로 추정):\n\n| 구역 | 문구 수 | 글자 수 | 추정 줄 수 |\n|---|---|---|---|\n')
for k, a in by.items(): w(f'| {k} | {a[0]} | {a[1]} | {a[2]} |\n')
w('\n한계: 패널 높이는 패널 전체 높이(내부 스크롤 컨테이너가 아니므로 scrollH=clientH)이며, 큰 PNG 한계·외부 GLB·오류 상태·칼선 분할 각 모드의 조건부 문구는 위 목록에서 hidden 으로 잡힌 것을 원문 그대로 기록했다(상태를 모두 재현하는 브라우저 실행은 headless GPU 메모리 한계로 페이지가 종료되어 중단). 새 UI(레이어 구역·방향 안내·가져오기)는 정적 문구를 포함했다.\n')
(ROOT / 'verification/ui-info/inventory.md').write_text(out.getvalue(), encoding='utf-8')
print(counts)

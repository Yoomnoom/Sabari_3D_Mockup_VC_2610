# 작업 32B: 긴 안내 문구를 "짧은 한 줄(항상 노출) + 자세히 보기(원문 전체)"로 바꾼다. 원문은 지우지 않고 details 안에 그대로 둔다.
# 사용: python tools/ui_apply_more.py <탭이름> — 규칙 표(RULES)에 있는 항목만 바꾸고, 매핑을 tools/ui_text_map.json 에 누적한다.
import json, re, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / 'frontend/index.html'
MAP = ROOT / 'tools/ui_text_map.json'

# 탭 -> [(원문 문단의 시작 문자열(고유), 짧은 문구 또는 None=항상 노출 문구 없이 접기만, 매핑 id)]
RULES = {
    'view': [
        ('카드 클릭: 불러오기 · 저장:', '카드를 누르면 불러오고, 저장은 덮어씁니다.', 'viewPresetsHint'),
        ('축 잠금 중 3D 화면에 보이는 파란 축 선', '축 선은 화면에서만 보입니다.', 'axisGuideHint'),
        ('시점 버튼은 박스를 기본 자세로 되돌리고', '시점 버튼은 방향만 바꾸고 확대는 유지합니다.', 'viewButtonsHint'),
        ('드래그: 박스 자유 회전(제한 없음)', '드래그로 회전하고 휠로 확대합니다.', 'dragHint'),
        ('넣은 색은 카메라를 마주 보는 면에서 그대로 보입니다.', '카메라를 마주 보는 면은 입력 색 그대로 보입니다.', 'shadeHint'),
        ('스튜디오 소프트는 낮은 빛에서', '스타일에 따라 번지는 정도가 다릅니다.', 'shStyleHintShort'),
        ('배경은 화면에만 보이고 GLB에는 들어가지 않습니다. 박스를 돌려도', '배경은 화면에만 보이고 GLB에는 들어가지 않습니다.', 'bgHint'),
        ('화면 전용이며 PNG·GLB에는 들어가지 않습니다. 켜고 마우스를', '화면 전용이며 PNG·GLB에는 들어가지 않습니다.', 'edgeHint'),
    ],
    'design': [
        ('칼선 위에서 만든 디자인 한 장(PNG/JPG)을', '칼선 위 디자인 한 장을 면별로 자동 분할합니다.', 'dielineHint'),
    ],
    'export': [
        ('현재 치수로 만든 1:1(mm) SVG입니다.', '현재 치수 기준 1:1(mm) SVG입니다.', 'svgHint'),
        ('변경 후 자동 보관 · 이 브라우저에만', '임시저장은 현재 브라우저에만 보관됩니다.', 'draftHint'),
    ],
    'split': [
        ('손 도구(Space)·가운데 버튼·스크롤바·방향키로 이동', '이동: 손 도구(Space) · 확대: +/− 키·휠', 'splitPanHint'),
    ],
}


def strip_tags(s):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', s)).strip()


def apply(tab):
    html = HTML.read_text(encoding='utf-8')
    m = json.loads(MAP.read_text(encoding='utf-8')) if MAP.exists() else {}
    for start, short, mid in RULES[tab]:
        i = html.find(start)
        assert i >= 0, ('시작 문자열 없음', start)
        a = html.rfind('<p', 0, i)
        b = html.index('</p>', i) + 4
        para = html[a:b]
        assert para.count('<p') == 1, para[:80]
        open_tag = re.match(r'<p([^>]*)>', para)
        attrs = open_tag.group(1)
        orig_text = strip_tags(para)
        if 'more-body' in attrs:  # 이미 적용됨
            continue
        inner = para[open_tag.end():-4]
        new_attrs = attrs.replace('class="hint', 'class="hint more-body', 1) if 'class="hint' in attrs else attrs + ' class="hint more-body"'
        moved = f'<p{new_attrs}>{inner}</p>'
        out = f'<p class="hint short">{short}</p>\n<details class="more"><summary>자세히 보기</summary>{moved}</details>'
        html = html[:a] + out + html[b:]
        m[mid] = {'tab': tab, 'id': re.search(r'id="([^"]+)"', attrs).group(1) if 'id="' in attrs else '', 'before': orig_text, 'after_visible': short, 'original_kept_in': 'details.more > p.more-body'}
    HTML.write_text(html, encoding='utf-8')
    MAP.write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding='utf-8')
    print(tab, len(RULES[tab]), '항목 적용')


if __name__ == '__main__':
    apply(sys.argv[1])

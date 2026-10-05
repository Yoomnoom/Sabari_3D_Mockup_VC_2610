# 작업 9 후처리: 투명 PNG 알파·가장자리 흰선 측정, .sabari 비교, 변경 전 빌드와 꺼진 화면 픽셀 비교 결과 요약
import json, os, zipfile
from PIL import Image
D = os.path.join(os.path.dirname(__file__), '..', 'verification-private', 'floor-shadow')
out = {}
def comp(im, rgb):  # RGBA(straight) → rgb 배경 합성
    bg = Image.new('RGBA', im.size, rgb + (255,)); return Image.alpha_composite(bg, im).convert('RGB')
sh = Image.open(os.path.join(D, 'shadow_transparent.png')).convert('RGBA')
nos = Image.open(os.path.join(D, 'noshadow_transparent.png')).convert('RGBA')
W, H = sh.size
a = sh.getchannel('A'); a0 = nos.getchannel('A')
px, px0 = a.load(), a0.load(); rgb = sh.load()
semi = [(x, y) for y in range(H) for x in range(W) if 0 < px[x, y] < 255 and px0[x, y] == 0]
full_box = sum(1 for y in range(H) for x in range(W) if px0[x, y] > 0)
# 그림자 픽셀(상자가 없는 곳에서 새로 생긴 알파)
shadow = [(x, y) for y in range(H) for x in range(W) if px[x, y] > 0 and px0[x, y] == 0]
alphas = [px[x, y] for x, y in shadow]
out['shadow_pixels'] = len(shadow)
out['shadow_alpha'] = {'min': min(alphas), 'max': max(alphas), 'mean': round(sum(alphas) / len(alphas), 2), 'expected_max_for_strength_0.5': 127}
# 그림자 픽셀의 색 = 검정(RGB 0)이어야 흰 테두리가 없다 (straight alpha)
bad_rgb = sum(1 for x, y in shadow if max(rgb[x, y][:3]) > 8)
out['shadow_pixels_non_black_rgb'] = bad_rgb
# 합성: 마젠타·검정·흰색 배경에서 그림자 가장자리 밝기
res = {}
for name, bgc in {'magenta': (255, 0, 255), 'black': (0, 0, 0), 'white': (255, 255, 255)}.items():
    c = comp(sh, bgc).load(); b = bgc
    # 그림자 영역 밝기 범위: 배경보다 밝아지면(흰 테두리) 안 된다
    brighter = sum(1 for x, y in shadow if sum(c[x, y]) > sum(b) + 3)
    ch = [c[x, y] for x, y in shadow]
    res[name] = {'pixelsBrighterThanBackground': brighter, 'minSum': min(sum(v) for v in ch), 'maxSum': max(sum(v) for v in ch), 'bgSum': sum(b)}
out['composite_edges'] = res
# 상자 바깥 경계에서 "그림자 반투명 → 투명" 전이만 있고 흰 줄이 없는지: 그림자 가장자리(알파가 0인 이웃을 가진 픽셀)의 RGB
edge = [(x, y) for x, y in shadow if any(0 <= x + dx < W and 0 <= y + dy < H and px[x + dx, y + dy] == 0 for dx in (-1, 0, 1) for dy in (-1, 0, 1))]
out['edge_pixels'] = {'count': len(edge), 'maxRGB': max((max(rgb[x, y][:3]) for x, y in edge), default=0), 'alphaRange': [min(px[x, y] for x, y in edge), max(px[x, y] for x, y in edge)] if edge else None}
x2 = Image.open(os.path.join(D, 'shadow_transparent_x2.png')).convert('RGBA')
out['x2'] = {'size': list(x2.size), 'exact_double': x2.size == (W * 2, H * 2)}
w = Image.open(os.path.join(D, 'shadow_white.png')).convert('RGB')
out['white_png_has_shadow'] = {'darkestSum': min(sum(w.getpixel((x, y))) for x, y in shadow[::37])}
# .sabari 비교: project.json 에 그림자 관련 문자열이 없고 두 파일의 project.json 이 같다
paths = [l.strip() for l in open(os.path.join(D, 'sabari_files.txt'), encoding='utf-8') if l.strip()]
js = []
for f in paths:
    z = zipfile.ZipFile(f); names = z.namelist(); pj = z.read('project.json').decode('utf-8'); js.append(pj)
    out[os.path.basename(f)] = {'files': names, 'bytes': os.path.getsize(f), 'mentionsShadow': 'hadow' in pj or 'floor' in pj.lower(), 'schemaVersion': json.loads(pj).get('schemaVersion')}
out['sabari_project_json_identical_on_vs_off'] = js[0] == js[1]
json.dump(out, open(os.path.join(D, 'floor_shadow_post.json'), 'w'), indent=1)
print(json.dumps(out, indent=1))
assert out['shadow_pixels'] > 1000 and bad_rgb == 0
assert all(v['pixelsBrighterThanBackground'] == 0 for v in res.values())
assert out['x2']['exact_double'] and out['sabari_project_json_identical_on_vs_off'] and not any(out[os.path.basename(f)]['mentionsShadow'] for f in paths)

# 개발용: 칼선 분할 검증에 쓰는 합성 아트보드 이미지(525.7×349.0mm)를 만든다. 사용자 파일이 아니라 새로 만든 테스트 이미지다.
# 사용: python tools/make_synth_artboard.py <출력 폴더> <픽셀/mm> <모드: colors|glyphs|blank_body|large>
#   colors     : 뚜껑·몸통 10면에 면별 고유 색(경계 번짐 측정용)
#   glyphs     : 면마다 비대칭 글자(F)를 "접었을 때 읽히는 방향"으로 칼선 회전에 맞춰 놓는다(회전·거울상 검사용) + 기대 정립 이미지 저장
#   blank_body : 뚜껑만 칠하고 몸통 십자형은 흰색(실제 파일과 같은 상황)
#   large      : 6209×4122px(약 25.6MP) 큰 이미지(로딩 시간·메모리 측정용), 면 색 + 잔무늬
import json, os, sys, random
from PIL import Image, ImageDraw

out, ppm, mode = sys.argv[1], float(sys.argv[2]), sys.argv[3]
os.makedirs(out, exist_ok=True)
ART = (525.7, 349.0)
# frontend/src/dieline.ts PRESET_SABARI_160_110_43 와 같은 값(mm)
REG = {
    'lid_top': (77.04, 91.84, 117.4, 167.4), 'lid_back': (39.04, 91.84, 38, 167.4), 'lid_front': (194.44, 91.84, 38, 167.4),
    'lid_right': (77.04, 53.84, 117.4, 38), 'lid_left': (77.04, 259.24, 117.4, 38),
    'base_bottom': (330.27, 94.34, 112.4, 162.4), 'base_front': (287.27, 94.34, 43, 162.4), 'base_back': (442.67, 94.34, 43, 162.4),
    'base_right': (330.27, 51.34, 112.4, 43), 'base_left': (330.27, 256.74, 112.4, 43),
}
ROT = {'lid_top': 270, 'lid_back': 90, 'lid_front': 270, 'lid_right': 180, 'lid_left': 0,
       'base_bottom': 270, 'base_front': 270, 'base_back': 90, 'base_right': 0, 'base_left': 180}
# 3D 면 크기(mm, 정립 기준 가로×세로): 기본 치수 160×110×43, 뚜껑 115×165×38
FACE = {'lid_top': (165, 115), 'lid_back': (165, 38), 'lid_front': (165, 38), 'lid_right': (115, 38), 'lid_left': (115, 38),
        'base_bottom': (160, 110), 'base_front': (160, 43), 'base_back': (160, 43), 'base_right': (110, 43), 'base_left': (110, 43)}
COL = {'lid_top': (214, 40, 40), 'lid_front': (30, 100, 220), 'lid_back': (30, 160, 70), 'lid_left': (242, 194, 0), 'lid_right': (130, 50, 190),
       'base_bottom': (255, 102, 170), 'base_front': (0, 160, 170), 'base_back': (232, 89, 12), 'base_left': (122, 82, 0), 'base_right': (85, 85, 85)}
W, H = round(ART[0] * ppm), round(ART[1] * ppm)
if mode == 'large': W, H = 6209, 4122
sx, sy = W / ART[0], H / ART[1]
px = lambda r: (round(r[0] * sx), round(r[1] * sy), round((r[0] + r[2]) * sx), round((r[1] + r[3]) * sy))
img = Image.new('RGB', (W, H), (255, 255, 255))
d = ImageDraw.Draw(img)

def glyph(wpx, hpx):
    g = Image.new('RGB', (wpx, hpx), (250, 250, 250)); q = ImageDraw.Draw(g)
    u = min(wpx, hpx)
    q.rectangle([u * .08, u * .08, u * .24, hpx - u * .08], fill=(20, 20, 20))            # F 세로 막대
    q.rectangle([u * .08, u * .08, wpx * .62, u * .24], fill=(20, 20, 20))                # F 위 막대
    q.rectangle([u * .08, hpx * .42, wpx * .46, hpx * .42 + u * .16], fill=(20, 20, 20))  # F 가운데 막대
    q.ellipse([wpx - u * .30, u * .08, wpx - u * .08, u * .30], fill=(220, 30, 30))       # 오른쪽 위 빨강 점
    q.ellipse([u * .08, hpx - u * .30, u * .30, hpx - u * .08], fill=(30, 60, 220))       # 왼쪽 아래 파랑 점
    return g

manifest = {'ppm': ppm, 'size': [W, H], 'mode': mode}
rects = {k: v for k, v in REG.items() if not (mode == 'blank_body' and k.startswith('base_'))}
for k, r in rects.items():
    x0, y0, x1, y1 = px(r)
    if mode in ('colors', 'blank_body', 'large'):
        d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=COL[k])
    else:  # glyphs
        fw, fh = FACE[k]
        up = glyph(round(fw * 5), round(fh * 5))
        up.save(os.path.join(out, f'glyph_expected_{k}.png'))
        sheet = up.rotate(-ROT[k], expand=True)              # 면 이미지를 시계방향 ROT 만큼 돌려 시트에 놓는다
        sheet = sheet.resize((x1 - x0, y1 - y0), Image.LANCZOS)  # 패널(117.4×167.4)·날개 구간 전체에 맞춰 늘임
        img.paste(sheet, (x0, y0))
if mode == 'large':  # 잔무늬(압축이 너무 쉬워지지 않게): 면 위에 임의의 얇은 선
    rnd = random.Random(1)
    for _ in range(4000):
        x, y = rnd.randrange(W), rnd.randrange(H); d.line([x, y, x + rnd.randrange(-60, 60), y + rnd.randrange(-60, 60)], fill=(rnd.randrange(256), rnd.randrange(256), rnd.randrange(256)), width=1 + rnd.randrange(3))
if mode == 'large':  # 사진처럼 압축이 잘 안 되도록 약한 잡음(±1) 추가 → 파일 크기를 실제 인쇄 PNG(약 10MB) 수준으로
    import numpy as np
    a = np.asarray(img).astype('int16') + np.random.default_rng(2).integers(-1, 2, (H, W, 1), dtype='int16')
    img = Image.fromarray(np.clip(a, 0, 255).astype('uint8'))
name = f'synth_art_{mode}.png'
img.save(os.path.join(out, name), optimize=False)
manifest['file'] = name; manifest['bytes'] = os.path.getsize(os.path.join(out, name))
json.dump(manifest, open(os.path.join(out, f'synth_art_{mode}.json'), 'w'), indent=1)
print(name, W, H, manifest['bytes'])

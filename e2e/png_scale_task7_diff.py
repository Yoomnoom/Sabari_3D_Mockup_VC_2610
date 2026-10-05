# 작업 7 후처리: 같은 프레이밍(축소해서 겹친 차이), 투명 배경 가장자리 잘림 없음, 4배 저장분의 알파 확인
import json, os, sys
from PIL import Image, ImageChops, ImageStat
D = os.path.join(os.path.dirname(__file__), '..', 'verification-private', 'png-scale')
def load(n): return Image.open(os.path.join(D, n)).convert('RGBA')
out = {}
for bg in ('white', 'transparent'):
    base = load(f'small_{bg}_x1.png')
    for s in (2, 4):
        big = load(f'small_{bg}_x{s}.png').resize(base.size, Image.LANCZOS)
        a = base.convert('RGB') if bg == 'white' else Image.alpha_composite(Image.new('RGBA', base.size, 'white'), base).convert('RGB')
        b = big.convert('RGB') if bg == 'white' else Image.alpha_composite(Image.new('RGBA', base.size, 'white'), big).convert('RGB')
        diff = ImageChops.difference(a, b)
        st = ImageStat.Stat(diff)
        out[f'{bg}_x{s}_vs_x1'] = {'meanAbsDiff': [round(x, 3) for x in st.mean], 'maxDiff': [e[1] for e in diff.getextrema()]}
for s in (1, 2, 4):
    im = load(f'small_transparent_x{s}.png'); al = im.getchannel('A'); bb = al.point(lambda v: 255 if v > 0 else 0).getbbox()
    W, H = im.size
    out[f'transparent_x{s}_alpha_bbox'] = {'size': [W, H], 'bbox': bb, 'marginPx': [bb[0], bb[1], W - bb[2], H - bb[3]], 'touchesBorder': bb[0] == 0 or bb[1] == 0 or bb[2] == W or bb[3] == H}
    assert not out[f'transparent_x{s}_alpha_bbox']['touchesBorder'], f'x{s} 가장자리 잘림'
big = load('big_white_x4.png'); out['large_white_x4_size'] = list(big.size)
json.dump(out, open(os.path.join(D, 'png_scale_diff.json'), 'w'), indent=1)
print(json.dumps(out, indent=1))

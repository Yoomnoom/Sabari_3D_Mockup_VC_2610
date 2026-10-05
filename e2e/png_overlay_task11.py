# 작업 11-4 후처리: 선택선 켠/끈 PNG 픽셀 비교, GLB 노드 이름 검사
import json, os, struct
from PIL import Image, ImageChops
D = os.path.join(os.path.dirname(__file__), '..', 'verification', 'png-overlay')
out = {}
def same(a, b):
    A = Image.open(os.path.join(D, a)).convert('RGBA'); B = Image.open(os.path.join(D, b)).convert('RGBA')
    if A.size != B.size: return {'sameSize': False, 'sizes': [A.size, B.size]}
    d = ImageChops.difference(A, B); bb = d.getbbox()
    n = sum(1 for px in d.getdata() if any(px)) if bb else 0
    return {'sameSize': True, 'differentPixels': n, 'size': list(A.size)}
for bg in ('white', 'transparent'):
    for sc in ('1', '2', '4'):
        out[f'highlight_{bg}_x{sc}'] = same(f'png_with_lines_{bg}_x{sc}.png', f'png_without_lines_{bg}_x{sc}.png')
for bg in ('white', 'transparent'):
    out[f'lock_lines_{bg}'] = same(f'png_lock_lines_on_{bg}_x1.png', f'png_lock_lines_off_{bg}_x1.png')
b = open(os.path.join(D, 'glb_with_selection.glb'), 'rb').read()
jl = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + jl])
names = [n.get('name', '') for n in j.get('nodes', [])]
out['glb_node_names'] = names
out['glb_has_overlay_names'] = any(('highlight' in n.lower() or 'lock' in n.lower() or 'select' in n.lower()) for n in names)
json.dump(out, open(os.path.join(D, 'png_overlay_post.json'), 'w'), indent=1)
print(json.dumps({k: v for k, v in out.items() if k != 'glb_node_names'}, indent=0))
bad = [k for k, v in out.items() if isinstance(v, dict) and v.get('differentPixels', 0) > 0]
print('선택선이 PNG에 들어간 항목:', bad)

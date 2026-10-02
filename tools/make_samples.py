"""샘플 이미지 생성 (면마다 색이 달라 번짐을 눈으로 확인할 수 있다). 사용법: python tools/make_samples.py"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / "assets" / "samples"
OUT.mkdir(parents=True, exist_ok=True)
FONT = "C:/Windows/Fonts/malgunbd.ttf"

# (파일, 크기 px, 배경색, 글자)
SPECS = [
    ("sample_lid_top.png", (3200, 2200), (214, 40, 40), "상단 TOP  ▲ 위쪽 = 박스 뒤"),
    ("sample_lid_front.png", (3300, 760), (30, 100, 220), "앞날개 FRONT"),
    ("sample_lid_back.png", (3300, 760), (30, 160, 70), "뒷날개 BACK"),
    ("sample_lid_left.png", (2300, 760), (0, 160, 170), "왼쪽 날개 LEFT"),
    ("sample_lid_right.png", (2300, 760), (130, 50, 190), "오른쪽 날개 RIGHT"),
    # 하단 몸통 5면 (160×110×43 기준 비율). 색상 hue가 뚜껑 5면과 겹치지 않게 골랐다(번짐 측정용).
    ("sample_base_front.png", (3200, 860), (240, 120, 20), "하단 앞면 BASE FRONT"),
    ("sample_base_back.png", (3200, 860), (60, 40, 255), "하단 뒷면 BASE BACK"),
    ("sample_base_left.png", (2200, 860), (220, 40, 170), "하단 왼쪽 BASE LEFT"),
    ("sample_base_right.png", (2200, 860), (230, 40, 100), "하단 오른쪽 BASE RIGHT"),
    ("sample_base_bottom.png", (3200, 2200), (140, 200, 20), "하단 바닥 BASE BOTTOM  ▲ 위쪽 = 박스 앞"),
]

for name, (w, h), color, text in SPECS:
    im = Image.new("RGB", (w, h), color)
    d = ImageDraw.Draw(im)
    b = max(8, h // 25)
    d.rectangle([0, 0, w - 1, h - 1], outline=(255, 255, 255), width=b)        # 흰 테두리
    d.rectangle([b * 2, b * 2, w - 1 - b * 2, h - 1 - b * 2], outline=(0, 0, 0), width=b)  # 검정 안쪽 테두리
    step = h // 4 if h < 1000 else h // 6
    for x in range(0, w, step):
        d.line([(x, 0), (x, h)], fill=tuple(min(255, c + 40) for c in color), width=3)
    f = ImageFont.truetype(FONT, int(h * (0.22 if h < 1000 else 0.12)))
    d.text((w // 2, h // 2), text, fill=(255, 255, 255), font=f, anchor="mm")
    # 방향 확인용 모서리 표식: 왼쪽 위 = 노란 사각형
    d.rectangle([b * 3, b * 3, b * 3 + h // 6, b * 3 + h // 6], fill=(255, 220, 0))
    im.save(OUT / name)
    print(name, im.size)

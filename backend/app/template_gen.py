"""사바리 박스 템플릿 GLB를 코드로 생성한다 (Blender 불필요, 표준 라이브러리만 사용).

좌표계: glTF 규격 (Y-up, 단위 m). 몸통 바닥이 y=0, XZ는 중앙 정렬.
  +X = 오른쪽, +Z = 앞(정면), -Z = 뒤.
면별 UV: 각 편집면은 UV 0..1 전체가 면 하나와 1:1 대응한다.
  glTF 규격대로 v=0이 이미지 위쪽(flipY=false 텍스처 기준).
  - lid_top : 위에서 내려다본 상태, 이미지 위쪽 = 박스 뒤쪽(-Z)
  - 날개면  : 박스 바깥에서 바라본 상태, 이미지 위쪽 = 위(+Y)
"""
from __future__ import annotations

import json
import struct
from dataclasses import dataclass, field

MM = 0.001

# 템플릿 치수(mm). 원본 inputs/sabari_closed.glb 의 extras 값과 동일.
BASE = (160.0, 110.0, 43.0)  # X, Z, Y
LID = (165.0, 115.0, 38.0)
BOARD = 2.0
CLEARANCE = 0.5  # 편측 여유 (LID - BASE) / 2

FACES = ["lid_top", "lid_front", "lid_back", "lid_left", "lid_right"]
FACE_LABELS = {
    "lid_top": "상단",
    "lid_front": "앞날개",
    "lid_back": "뒷날개",
    "lid_left": "왼쪽 날개",
    "lid_right": "오른쪽 날개",
}
TEMPLATE_ID = "sabari-160-110-43-v2"

# 재질(고정색). 편집면은 이미지가 없으면 흰색.
COLORS = {
    "lid_top": (0.97, 0.97, 0.96),
    "lid_front": (0.97, 0.97, 0.96),
    "lid_back": (0.97, 0.97, 0.96),
    "lid_left": (0.97, 0.97, 0.96),
    "lid_right": (0.97, 0.97, 0.96),
    "lid_rim": (0.78, 0.76, 0.72),  # 뚜껑 하단 두께면 (단색)
    "lid_inner": (0.90, 0.88, 0.84),
    "base": (0.86, 0.84, 0.80),
}


@dataclass
class MeshBuilder:
    pos: list = field(default_factory=list)
    nrm: list = field(default_factory=list)
    uv: list = field(default_factory=list)
    idx: list = field(default_factory=list)

    def quad(self, p, n, uvs=None):
        """p: 바깥에서 봤을 때 반시계(CCW) 순서의 꼭짓점 4개, n: 바깥 법선."""
        i = len(self.pos)
        for k in range(4):
            self.pos.append(p[k])
            self.nrm.append(n)
            self.uv.append(uvs[k] if uvs else (0.0, 0.0))
        self.idx += [i, i + 1, i + 2, i, i + 2, i + 3]


def _box_faces(w, d, y0, y1):
    """바깥면 5개(위/아래/앞/뒤/좌/우)의 CCW 꼭짓점. w=X, d=Z (m)."""
    x, z = w / 2, d / 2
    return {
        "top": ([(-x, y1, -z), (-x, y1, z), (x, y1, z), (x, y1, -z)], (0, 1, 0)),
        "bottom": ([(-x, y0, z), (-x, y0, -z), (x, y0, -z), (x, y0, z)], (0, -1, 0)),
        "front": ([(-x, y0, z), (x, y0, z), (x, y1, z), (-x, y1, z)], (0, 0, 1)),
        "back": ([(x, y0, -z), (-x, y0, -z), (-x, y1, -z), (x, y1, -z)], (0, 0, -1)),
        "left": ([(-x, y0, -z), (-x, y0, z), (-x, y1, z), (-x, y1, -z)], (-1, 0, 0)),
        "right": ([(x, y0, z), (x, y0, -z), (x, y1, -z), (x, y1, z)], (1, 0, 0)),
    }


def _uv_for(face: str, p, w, d, y0, y1):
    """꼭짓점 p 각각의 UV. 각 면의 이미지가 바깥에서 봤을 때 바로 서 보이도록 한다."""
    out = []
    for (x, y, z) in p:
        if face == "top":
            u, v = (x + w / 2) / w, (z + d / 2) / d
        elif face == "front":
            u, v = (x + w / 2) / w, (y1 - y) / (y1 - y0)
        elif face == "back":
            u, v = (w / 2 - x) / w, (y1 - y) / (y1 - y0)
        elif face == "left":
            u, v = (z + d / 2) / d, (y1 - y) / (y1 - y0)
        else:  # right
            u, v = (d / 2 - z) / d, (y1 - y) / (y1 - y0)
        out.append((u, v))
    return out


def _ring(mb: MeshBuilder, ow, od, iw, idp, y, up: bool):
    """수평 고리(두께면) 4개 사다리꼴. up=True면 법선 +Y."""
    ox, oz, ix, iz = ow / 2, od / 2, iw / 2, idp / 2
    n = (0, 1, 0) if up else (0, -1, 0)
    # 위에서 봤을 때 CCW 사다리꼴 (뒤, 오른쪽, 앞, 왼쪽)
    segs = [
        [(-ox, y, -oz), (-ix, y, -iz), (ix, y, -iz), (ox, y, -oz)],
        [(ox, y, -oz), (ix, y, -iz), (ix, y, iz), (ox, y, oz)],
        [(ox, y, oz), (ix, y, iz), (-ix, y, iz), (-ox, y, oz)],
        [(-ox, y, oz), (-ix, y, iz), (-ix, y, -iz), (-ox, y, -oz)],
    ]
    # 위에서 보면 +Y 법선일 때 CCW = (x→+, z→-)가 아닌 순서이므로 정렬을 법선에 맞춘다.
    for s in segs:
        quad = s if up else list(reversed(s))
        mb.quad(quad, n)


def _inner_walls(mb: MeshBuilder, iw, idp, y0, y1):
    """안쪽 4벽 (법선이 안쪽을 향함)."""
    x, z = iw / 2, idp / 2
    mb.quad([(x, y0, z), (-x, y0, z), (-x, y1, z), (x, y1, z)], (0, 0, -1))  # 앞벽 안쪽
    mb.quad([(-x, y0, -z), (x, y0, -z), (x, y1, -z), (-x, y1, -z)], (0, 0, 1))  # 뒷벽 안쪽
    mb.quad([(x, y0, -z), (x, y0, z), (x, y1, z), (x, y1, -z)], (-1, 0, 0))  # 오른쪽벽 안쪽
    mb.quad([(-x, y0, z), (-x, y0, -z), (-x, y1, -z), (-x, y1, z)], (1, 0, 0))  # 왼쪽벽 안쪽


def build_meshes():
    """이름 → MeshBuilder 딕셔너리. 부모 노드(Base/Lid) 소속 정보는 build_glb에서 정한다."""
    bw, bd, bh = BASE[0] * MM, BASE[1] * MM, BASE[2] * MM
    lw, ld, lh = LID[0] * MM, LID[1] * MM, LID[2] * MM
    t = BOARD * MM
    # 뚜껑은 몸통 위에 얹힌 상태: 천장 안쪽이 몸통 윗면(43mm)과 같은 높이.
    ly1 = bh + t
    ly0 = ly1 - lh

    meshes: dict[str, MeshBuilder] = {}

    # --- 뚜껑 편집면 5개 ---
    faces = _box_faces(lw, ld, ly0, ly1)
    mapping = {"lid_top": "top", "lid_front": "front", "lid_back": "back", "lid_left": "left", "lid_right": "right"}
    for name, key in mapping.items():
        mb = MeshBuilder()
        p, n = faces[key]
        mb.quad(p, n, _uv_for(key, p, lw, ld, ly0, ly1))
        meshes[name] = mb

    # --- 뚜껑 하단 두께면(테두리): 단색, 이미지가 번지지 않도록 독립 메시 ---
    rim = MeshBuilder()
    _ring(rim, lw, ld, lw - 2 * t, ld - 2 * t, ly0, up=False)
    meshes["lid_rim"] = rim

    # --- 뚜껑 안쪽(천장+벽) ---
    inner = MeshBuilder()
    iw, idp = lw - 2 * t, ld - 2 * t
    x, z = iw / 2, idp / 2
    inner.quad([(-x, ly1 - t, -z), (x, ly1 - t, -z), (x, ly1 - t, z), (-x, ly1 - t, z)], (0, -1, 0))
    _inner_walls(inner, iw, idp, ly0, ly1 - t)
    meshes["lid_inner"] = inner

    # --- 몸통(base): 열린 트레이. 이번 범위에서는 단색, 추후 면 분리 확장 ---
    base = MeshBuilder()
    bf = _box_faces(bw, bd, 0.0, bh)
    for key in ("bottom", "front", "back", "left", "right"):
        p, n = bf[key]
        base.quad(p, n)
    _ring(base, bw, bd, bw - 2 * t, bd - 2 * t, bh, up=True)
    _inner_walls(base, bw - 2 * t, bd - 2 * t, t, bh)
    x, z = (bw - 2 * t) / 2, (bd - 2 * t) / 2
    base.quad([(-x, t, z), (x, t, z), (x, t, -z), (-x, t, -z)], (0, 1, 0))
    meshes["base"] = base
    return meshes


def _pad4(b: bytes) -> bytes:
    return b + b"\x00" * (-len(b) % 4)


def build_glb() -> bytes:
    meshes = build_meshes()
    buf = bytearray()
    views, accessors, gl_meshes, materials, nodes = [], [], [], [], []

    def add_view(data: bytes, target: int) -> int:
        off = len(buf)
        buf.extend(_pad4(data))
        views.append({"buffer": 0, "byteOffset": off, "byteLength": len(data), "target": target})
        return len(views) - 1

    def add_acc(view, ctype, count, typ, mn=None, mx=None):
        a = {"bufferView": view, "componentType": ctype, "count": count, "type": typ}
        if mn is not None:
            a["min"], a["max"] = mn, mx
        accessors.append(a)
        return len(accessors) - 1

    lid_children, base_node = [], None
    for name, mb in meshes.items():
        n = len(mb.pos)
        flat_pos = [c for p in mb.pos for c in p]
        pos_acc = add_acc(
            add_view(struct.pack(f"<{n*3}f", *flat_pos), 34962), 5126, n, "VEC3",
            [min(mb.pos[i][k] for i in range(n)) for k in range(3)],
            [max(mb.pos[i][k] for i in range(n)) for k in range(3)],
        )
        nrm_acc = add_acc(add_view(struct.pack(f"<{n*3}f", *[c for v in mb.nrm for c in v]), 34962), 5126, n, "VEC3")
        attrs = {"POSITION": pos_acc, "NORMAL": nrm_acc}
        if name.startswith("lid_") and name in FACES:
            attrs["TEXCOORD_0"] = add_acc(
                add_view(struct.pack(f"<{n*2}f", *[c for v in mb.uv for c in v]), 34962), 5126, n, "VEC2"
            )
        idx_acc = add_acc(add_view(struct.pack(f"<{len(mb.idx)}H", *mb.idx), 34963), 5123, len(mb.idx), "SCALAR")
        r, g, b = COLORS[name]
        materials.append({
            "name": name,
            "pbrMetallicRoughness": {"baseColorFactor": [r, g, b, 1], "metallicFactor": 0, "roughnessFactor": 0.9},
            "doubleSided": False,
        })
        gl_meshes.append({"name": name, "primitives": [{"attributes": attrs, "indices": idx_acc, "material": len(materials) - 1}]})
        nodes.append({"name": name, "mesh": len(gl_meshes) - 1})
        if name == "base":
            base_node = len(nodes) - 1
        else:
            lid_children.append(len(nodes) - 1)

    nodes.append({"name": "Lid", "children": lid_children, "translation": [0, 0, 0]})
    lid_idx = len(nodes) - 1
    nodes[base_node]["name"] = "Base"
    root = {
        "asset": {"version": "2.0", "generator": "Sabari Mockup Studio template_gen"},
        "scene": 0,
        "scenes": [{"nodes": [base_node, lid_idx]}],
        "nodes": nodes,
        "meshes": gl_meshes,
        "materials": materials,
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(buf)}],
        "extras": {
            "templateId": TEMPLATE_ID,
            "units": "meters",
            "up": "Y",
            "nominal_base_mm": list(BASE),
            "mockup_lid_mm": list(LID),
            "board_thickness_assumed_mm": BOARD,
            "clearance_per_side_mm": CLEARANCE,
            "editableFaces": FACES,
            "faceSizeMm": {
                "lid_top": [LID[0], LID[1]],
                "lid_front": [LID[0], LID[2]],
                "lid_back": [LID[0], LID[2]],
                "lid_left": [LID[1], LID[2]],
                "lid_right": [LID[1], LID[2]],
            },
            "note": "목업용 가정 치수이며 제조 치수가 아님.",
        },
    }
    js = _pad4_json(json.dumps(root, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    bin_chunk = bytes(buf)
    total = 12 + 8 + len(js) + 8 + len(bin_chunk)
    return (
        struct.pack("<4sII", b"glTF", 2, total)
        + struct.pack("<I4s", len(js), b"JSON") + js
        + struct.pack("<I4s", len(bin_chunk), b"BIN\x00") + bin_chunk
    )


def _pad4_json(b: bytes) -> bytes:
    return b + b" " * (-len(b) % 4)


if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else "assets/templates/sabari_160x110x43_v2.glb"
    data = build_glb()
    with open(out, "wb") as f:
        f.write(data)
    print(f"wrote {out} ({len(data)} bytes)")

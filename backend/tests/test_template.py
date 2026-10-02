import json, struct
from app.template_gen import build_glb, build_meshes, FACES, LID_FACES, BASE_FACES, BASE, LID


def _cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def test_winding_matches_normals():
    for name, mb in build_meshes().items():
        for t in range(0, len(mb.idx), 3):
            a, b, c = (mb.pos[i] for i in mb.idx[t:t+3])
            e1 = tuple(b[k]-a[k] for k in range(3)); e2 = tuple(c[k]-a[k] for k in range(3))
            n = _cross(e1, e2)
            ns = mb.nrm[mb.idx[t]]
            assert sum(n[k]*ns[k] for k in range(3)) > 0, f"{name} tri {t//3} 방향 불일치"


def test_structure():
    d = build_glb()
    jl = struct.unpack("<I", d[12:16])[0]
    j = json.loads(d[20:20+jl])
    names = {n["name"] for n in j["nodes"]}
    assert set(FACES) <= names and {"lid_rim", "lid_inner", "base_rim", "base_inner", "Base", "Lid"} <= names
    assert len(FACES) == 10 and len(LID_FACES) == 5 and len(BASE_FACES) == 5
    mats = {m["name"] for m in j["materials"]}
    assert set(FACES) <= mats
    for f in FACES:
        m = next(x for x in j["meshes"] if x["name"] == f)
        assert "TEXCOORD_0" in m["primitives"][0]["attributes"]
    for name in ("lid_rim", "lid_inner", "base_rim", "base_inner"):  # 단색 부품: UV가 없어 이미지가 번지지 않는다
        m = next(x for x in j["meshes"] if x["name"] == name)
        assert "TEXCOORD_0" not in m["primitives"][0]["attributes"], name
    # 노드 계층: Lid 아래에 뚜껑 부품, Base 아래에 몸통 부품
    by = {n["name"]: n for n in j["nodes"]}
    lid_kids = {j["nodes"][i]["name"] for i in by["Lid"]["children"]}
    base_kids = {j["nodes"][i]["name"] for i in by["Base"]["children"]}
    assert lid_kids == set(LID_FACES) | {"lid_rim", "lid_inner"}
    assert base_kids == set(BASE_FACES) | {"base_rim", "base_inner"}


def test_uv_cover_full_unit_square():
    for f in FACES:
        uv = build_meshes()[f].uv
        assert sorted(set(uv)) == [(0.0, 0.0), (0.0, 1.0), (1.0, 0.0), (1.0, 1.0)]


def test_closed_dimensions():
    ms = build_meshes()
    ys = [p[1] for m in ms.values() for p in m.pos]
    assert abs(max(ys) - 0.045) < 1e-9 and abs(min(ys)) < 1e-9
    xs = [p[0] for m in ms.values() for p in m.pos]
    assert abs(max(xs) - 0.0825) < 1e-9


def test_base_bottom_uv_not_mirrored_seen_from_below():
    """아래에서 올려다본 상태에서 이미지 위쪽 = 앞(+Z), 오른쪽 = +X."""
    mb = build_meshes()["base_bottom"]
    for (x, y, z), (u, v) in zip(mb.pos, mb.uv):
        assert abs(u - (x + BASE[0] * 0.0005) / (BASE[0] * 0.001)) < 1e-6
        assert abs(v - (BASE[1] * 0.0005 - z) / (BASE[1] * 0.001)) < 1e-6
        assert y == 0.0


def test_base_side_uv_matches_lid_rule():
    """옆면은 뚜껑과 같은 규칙: 이미지 위쪽 = 위(+Y), 바깥에서 본 왼쪽→오른쪽."""
    mb = build_meshes()["base_front"]
    for (x, y, z), (u, v) in zip(mb.pos, mb.uv):
        assert z > 0 and abs(v - (0.043 - y) / 0.043) < 1e-6 and abs(u - (x + 0.08) / 0.16) < 1e-6


def test_face_sizes_in_extras():
    d = build_glb()
    j = json.loads(d[20:20 + struct.unpack("<I", d[12:16])[0]])
    sz = j["extras"]["faceSizeMm"]
    assert sz["base_front"] == [160, 43] and sz["base_left"] == [110, 43] and sz["base_bottom"] == [160, 110]
    assert j["extras"]["editableFaces"] == LID_FACES and j["extras"]["optionalFaces"] == BASE_FACES

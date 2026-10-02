import json, struct
from app.template_gen import build_glb, build_meshes, FACES, BASE, LID


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
    assert set(FACES) <= names and {"lid_rim", "lid_inner", "Base", "Lid"} <= names
    mats = {m["name"] for m in j["materials"]}
    assert set(FACES) <= mats
    for f in FACES:
        m = next(x for x in j["meshes"] if x["name"] == f)
        assert "TEXCOORD_0" in m["primitives"][0]["attributes"]
    rim = next(x for x in j["meshes"] if x["name"] == "lid_rim")
    assert "TEXCOORD_0" not in rim["primitives"][0]["attributes"]


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

import io
import json
import zipfile

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.images import safe_name

c = TestClient(app)


def png(w=40, h=20, color=(200, 30, 30, 255)):
    b = io.BytesIO()
    Image.new("RGBA", (w, h), color).save(b, "PNG")
    return b.getvalue()


def project(**surf):
    return json.dumps({"schemaVersion": 2, "surfaces": {"lid_top": {"scale": 1.2, "rotationDeg": 180, **surf}}})


def test_health_and_templates():
    assert c.get("/api/health").json()["status"] == "ok"
    t = c.get("/api/templates").json()[0]
    assert [f["id"] for f in t["faces"]] == ["lid_top", "lid_front", "lid_back", "lid_left", "lid_right",
                                             "base_front", "base_back", "base_left", "base_right", "base_bottom"]
    assert c.get("/api/template.glb").content[:4] == b"glTF"


def test_inspect_ok_and_rejects():
    r = c.post("/api/images/inspect", files={"file": ("a.png", png(), "image/png")})
    assert r.json()["width"] == 40 and r.json()["hasAlpha"]
    r = c.post("/api/images/inspect", files={"file": ("a.png", b"not an image", "image/png")})
    assert r.status_code == 400 and "읽지 못했습니다" in r.json()["error"]
    b = io.BytesIO(); Image.new("RGB", (4, 4)).save(b, "GIF")
    r = c.post("/api/images/inspect", files={"file": ("a.png", b.getvalue(), "image/png")})
    assert r.status_code == 400 and "PNG, JPG" in r.json()["error"]


def test_project_roundtrip_korean_name_and_original_bytes():
    data = png(60, 30)
    r = c.post("/api/projects/save", data={"project": project(), "faces": json.dumps(["lid_top"])},
               files=[("files", ("내 디자인 이미지.png", data, "image/png"))])
    assert r.status_code == 200
    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert z.read("images/lid_top.png") == data  # 원본 바이트 그대로
    r2 = c.post("/api/projects/open", files={"file": ("p.sabari", r.content)})
    j = r2.json()
    assert j["project"]["surfaces"]["lid_top"]["rotationDeg"] == 180
    assert j["project"]["surfaces"]["lid_top"]["scale"] == 1.2
    assert j["images"]["lid_top"]["name"] == "내 디자인 이미지.png"


def test_project_version_and_schema():
    r = c.post("/api/projects/save", data={"project": json.dumps({"schemaVersion": 1, "surfaces": {}})})
    assert r.status_code == 400 and "버전" in r.json()["error"]
    r = c.post("/api/projects/save", data={"project": project(rotationDeg=45)})
    assert r.status_code == 400


def test_open_blocks_path_traversal():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("project.json", json.dumps({"schemaVersion": 2, "surfaces": {"lid_top": {"sourceFile": "../evil.png"}}}))
    r = c.post("/api/projects/open", files={"file": ("p.sabari", buf.getvalue())})
    assert r.status_code == 400 and "경로" in r.json()["error"]
    r = c.post("/api/projects/open", files={"file": ("p.sabari", b"garbage")})
    assert r.status_code == 400


def test_safe_name():
    assert safe_name("../../etc/pass wd.png") == "pass wd.png"
    assert safe_name("C:\\a\\한글 파일.png") == "한글 파일.png"

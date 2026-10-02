"""프로젝트(.sabari = ZIP) 저장/열기. project.json + images/ 원본."""
from __future__ import annotations

import base64
import io
import json
import zipfile
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from .images import ImageError, inspect, safe_name
from .template_gen import FACES, TEMPLATE_ID

SCHEMA_VERSION = 2
MAX_ZIP_ENTRIES = 32
MAX_UNCOMPRESSED = 400 * 1024 * 1024


class ProjectError(ValueError):
    pass


class Surface(BaseModel):
    sourceFile: str | None = None  # ZIP 안의 경로 (예: images/lid_top.png)
    originalName: str | None = None  # 사용자가 고른 원래 파일명 (표시용)
    fit: Literal["contain", "cover"] = "contain"
    rotationDeg: Literal[0, 90, 180, 270] = 0
    flipX: bool = False
    flipY: bool = False
    scale: float = Field(1.0, ge=0.25, le=3.0)
    offsetX: float = Field(0.0, ge=-1.0, le=1.0)  # 면 폭 대비 비율
    offsetY: float = Field(0.0, ge=-1.0, le=1.0)  # 면 높이 대비 비율


class Box(BaseModel):
    lidLiftMm: float = Field(0.0, ge=0, le=150)


class Project(BaseModel):
    schemaVersion: int
    templateId: str = TEMPLATE_ID
    box: Box = Box()
    background: Literal["white", "transparent"] = "white"
    surfaces: dict[str, Surface]


def validate_project(raw: dict) -> Project:
    if not isinstance(raw, dict) or raw.get("schemaVersion") != SCHEMA_VERSION:
        raise ProjectError("이 프로젝트는 현재 버전에서 열 수 없습니다. 앱을 업데이트해 주세요.")
    try:
        p = Project.model_validate(raw)
    except ValidationError as e:
        raise ProjectError(f"프로젝트 파일 형식이 올바르지 않습니다: {e.errors()[0]['loc']}")
    if p.templateId != TEMPLATE_ID:
        raise ProjectError("지원하지 않는 템플릿의 프로젝트입니다.")
    unknown = set(p.surfaces) - set(FACES)
    if unknown:
        raise ProjectError(f"알 수 없는 면이 있습니다: {sorted(unknown)}")
    return p


def pack(project_json: str, images: dict[str, tuple[str, bytes]]) -> bytes:
    """images: face -> (원래 파일명, 원본 바이트). 원본 바이트는 그대로 ZIP에 넣는다."""
    try:
        raw = json.loads(project_json)
    except json.JSONDecodeError:
        raise ProjectError("프로젝트 데이터를 읽지 못했습니다.")
    if isinstance(raw, dict):
        for s in (raw.get("surfaces") or {}).values():
            if isinstance(s, dict):
                s["sourceFile"] = None
    proj = validate_project(raw)
    out = proj.model_dump()
    files: dict[str, bytes] = {}
    for face, (orig, data) in images.items():
        if face not in FACES:
            raise ProjectError(f"알 수 없는 면: {face}")
        try:
            info = inspect(data)
        except ImageError as e:
            raise ProjectError(str(e))
        path = f"images/{face}{info['ext']}"
        files[path] = data
        s = out["surfaces"].setdefault(face, Surface().model_dump())
        s["sourceFile"] = path
        s["originalName"] = safe_name(orig)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("project.json", json.dumps(out, ensure_ascii=False, indent=2))
        for path, data in files.items():
            z.writestr(path, data, compress_type=zipfile.ZIP_STORED)
    return buf.getvalue()


def unpack(data: bytes) -> dict:
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise ProjectError("프로젝트 파일(.sabari)을 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.")
    infos = z.infolist()
    if len(infos) > MAX_ZIP_ENTRIES or sum(i.file_size for i in infos) > MAX_UNCOMPRESSED:
        raise ProjectError("프로젝트 파일이 너무 크거나 항목이 많습니다.")
    if "project.json" not in z.namelist():
        raise ProjectError("project.json이 없는 파일입니다.")
    try:
        raw = json.loads(z.read("project.json"))
    except json.JSONDecodeError:
        raise ProjectError("프로젝트 데이터를 읽지 못했습니다.")
    proj = validate_project(raw)
    images = {}
    for face, s in proj.surfaces.items():
        if not s.sourceFile:
            continue
        # 경로 순회 차단: images/ 아래 단일 파일명만 허용
        if not s.sourceFile.startswith("images/") or ".." in s.sourceFile or "\\" in s.sourceFile or s.sourceFile.count("/") != 1:
            raise ProjectError("프로젝트 안에 허용되지 않는 경로가 있습니다.")
        try:
            img = z.read(s.sourceFile)
        except KeyError:
            raise ProjectError(f"{face} 이미지가 파일 안에 없습니다.")
        try:
            info = inspect(img)
        except ImageError as e:
            raise ProjectError(str(e))
        images[face] = {"mime": info["mime"], "name": s.originalName or s.sourceFile, "base64": base64.b64encode(img).decode()}
    return {"project": proj.model_dump(), "images": images}

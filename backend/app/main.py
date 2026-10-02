from __future__ import annotations

import json
import os
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from . import images, project_io
from .template_gen import BASE, BOARD, FACE_LABELS, FACES, LID, TEMPLATE_ID, build_glb

VERSION = "1.0.0"
ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "frontend" / "dist"
TEMPLATE_GLB = ROOT / "assets" / "templates" / "sabari_160x110x43_v2.glb"

app = FastAPI(title="Sabari Mockup Studio", version=VERSION)


@app.exception_handler(images.ImageError)
@app.exception_handler(project_io.ProjectError)
async def _bad_request(_, exc):
    return JSONResponse({"error": str(exc)}, status_code=400)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": VERSION}


@app.get("/api/templates")
def templates():
    return [{
        "id": TEMPLATE_ID, "baseMm": list(BASE), "lidMm": list(LID), "boardMm": BOARD,
        "faces": [{"id": f, "label": FACE_LABELS[f]} for f in FACES],
    }]


@app.get("/api/template.glb")
def template_glb():
    if TEMPLATE_GLB.exists():
        return FileResponse(TEMPLATE_GLB, media_type="model/gltf-binary")
    return Response(build_glb(), media_type="model/gltf-binary")


@app.post("/api/images/inspect")
async def inspect_image(file: UploadFile = File(...)):
    data = await file.read(images.MAX_BYTES + 1)
    return images.inspect(data)


@app.post("/api/projects/save")
async def save_project(project: str = Form(...), faces: str = Form("[]"), files: list[UploadFile] = File(default=[])):
    """faces: 업로드 파일과 같은 순서의 면 이름 목록(JSON). 파일명은 UploadFile.filename."""
    try:
        names = json.loads(faces)
    except json.JSONDecodeError:
        raise project_io.ProjectError("요청 형식이 올바르지 않습니다.")
    if len(names) != len(files):
        raise project_io.ProjectError("면 목록과 파일 개수가 맞지 않습니다.")
    imgs = {n: (f.filename or "image", await f.read(images.MAX_BYTES + 1)) for n, f in zip(names, files)}
    return Response(project_io.pack(project, imgs), media_type="application/zip")


@app.post("/api/projects/open")
async def open_project(file: UploadFile = File(...)):
    return project_io.unpack(await file.read())


if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="web")


def run():
    import threading
    import time
    import webbrowser

    import uvicorn

    import socket

    port = int(os.environ.get("SABARI_PORT", "8765"))
    with socket.socket() as probe:
        if probe.connect_ex(("127.0.0.1", port)) == 0:  # 이미 실행 중이면 브라우저만 연다
            print(f"이미 실행 중입니다. 브라우저를 엽니다: http://127.0.0.1:{port}")
            if not os.environ.get("SABARI_NO_BROWSER"):
                webbrowser.open(f"http://127.0.0.1:{port}")
            return
    if not os.environ.get("SABARI_NO_BROWSER"):
        threading.Thread(target=lambda: (time.sleep(1.5), webbrowser.open(f"http://127.0.0.1:{port}")), daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    run()

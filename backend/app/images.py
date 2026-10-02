"""업로드 이미지 검증. 확장자가 아니라 실제 디코딩으로 판별한다. 원본 바이트는 수정하지 않는다."""
from __future__ import annotations

import io
import re
import unicodedata

from PIL import Image, UnidentifiedImageError

MAX_BYTES = 50 * 1024 * 1024
MAX_SIDE = 12000
ALLOWED = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}
EXT = {"PNG": ".png", "JPEG": ".jpg", "WEBP": ".webp"}

Image.MAX_IMAGE_PIXELS = MAX_SIDE * MAX_SIDE * 2


class ImageError(ValueError):
    pass


def safe_name(name: str, default: str = "image") -> str:
    """경로 순회 문자 제거. 한글·공백은 유지한다."""
    name = name.replace("\\", "/").split("/")[-1]
    name = unicodedata.normalize("NFC", name)
    name = re.sub(r'[\x00-\x1f<>:"|?*]', "", name).strip(" .")
    return name or default


def inspect(data: bytes) -> dict:
    if len(data) > MAX_BYTES:
        raise ImageError("이미지가 50MB를 초과합니다. 더 작은 파일을 사용해 주세요.")
    try:
        with Image.open(io.BytesIO(data)) as im:
            fmt = im.format
            if fmt not in ALLOWED:
                raise ImageError("PNG, JPG 또는 WebP 이미지를 선택해 주세요.")
            im.load()
            w, h = im.size
            alpha = im.mode in ("RGBA", "LA", "PA") or "transparency" in im.info
    except ImageError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, SyntaxError):
        raise ImageError("이미지를 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.")
    warnings = []
    if max(w, h) > MAX_SIDE:
        warnings.append(f"가장 긴 변이 {MAX_SIDE}px를 넘어 미리보기용 복사본만 축소해 사용합니다. 원본은 그대로 보존됩니다.")
    return {
        "format": fmt, "mime": ALLOWED[fmt], "ext": EXT[fmt], "width": w, "height": h,
        "ratio": round(w / h, 4), "hasAlpha": bool(alpha), "bytes": len(data), "warnings": warnings,
    }

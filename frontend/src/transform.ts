// 면 하나에 이미지를 올리는 변환 계산. 미리보기와 GLB 굽기가 이 함수를 함께 쓴다.
export type Fit = 'contain' | 'cover';
export type Rotation = 0 | 90 | 180 | 270;

export interface SurfaceState {
  fit: Fit;
  rotationDeg: Rotation;
  flipX: boolean;
  flipY: boolean;
  scale: number; // 1 = 맞춤 기준 크기
  offsetX: number; // 면 폭 대비 비율 (오른쪽 +)
  offsetY: number; // 면 높이 대비 비율 (아래쪽 +)
}

export const defaultState = (): SurfaceState => ({
  fit: 'contain', rotationDeg: 0, flipX: false, flipY: false, scale: 1, offsetX: 0, offsetY: 0,
});

export interface Layout {
  cx: number; cy: number; // 이미지 중심 (캔버스 px)
  w: number; h: number; // 회전 전 이미지 그리기 크기 (px)
  rot: number; // rad
  fx: 1 | -1; fy: 1 | -1; // 화면 기준 반전
}

/** 변환 순서: translate(중심) → 화면 기준 반전 → 회전 → 이미지. */
export function computeLayout(cw: number, ch: number, iw: number, ih: number, s: SurfaceState): Layout {
  const swap = s.rotationDeg === 90 || s.rotationDeg === 270;
  const rw = swap ? ih : iw;
  const rh = swap ? iw : ih;
  const fitScale = s.fit === 'cover' ? Math.max(cw / rw, ch / rh) : Math.min(cw / rw, ch / rh);
  const k = fitScale * s.scale;
  return {
    cx: cw / 2 + s.offsetX * cw,
    cy: ch / 2 + s.offsetY * ch,
    w: iw * k, h: ih * k,
    rot: (s.rotationDeg * Math.PI) / 180,
    fx: s.flipX ? -1 : 1, fy: s.flipY ? -1 : 1,
  };
}

export function textureSize(faceWmm: number, faceHmm: number, longSide = 2048): [number, number] {
  const r = faceWmm / faceHmm;
  return r >= 1 ? [longSide, Math.max(1, Math.round(longSide / r))] : [Math.max(1, Math.round(longSide * r)), longSide];
}

/** 캔버스에 구워 넣는다. 이미지가 없으면 호출하지 않는다. */
export function bake(ctx: CanvasRenderingContext2D, cw: number, ch: number, img: CanvasImageSource, iw: number, ih: number, s: SurfaceState) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff'; // 투명 픽셀/여백은 흰색
  ctx.fillRect(0, 0, cw, ch);
  ctx.beginPath();
  ctx.rect(0, 0, cw, ch);
  ctx.clip(); // 면 밖으로 그려지지 않도록
  const l = computeLayout(cw, ch, iw, ih, s);
  ctx.translate(l.cx, l.cy);
  ctx.scale(l.fx, l.fy);
  ctx.rotate(l.rot);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, -l.w / 2, -l.h / 2, l.w, l.h);
  ctx.restore();
}

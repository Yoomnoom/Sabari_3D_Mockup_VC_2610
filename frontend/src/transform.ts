// 면 하나에 이미지를 올리는 변환 계산. 미리보기와 GLB 굽기가 이 함수를 함께 쓴다.
/** 'tile'(반복)은 바탕 이미지(아래 레이어)에서만 쓴다. 크기는 'contain' 기준이다. */
export type Fit = 'contain' | 'cover' | 'tile';
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

/** 바탕 이미지(아래 레이어)의 변환: 위 레이어와 같은 변환 + 불투명도(0~1)·보이기 */
export interface UnderlayState extends SurfaceState { opacity: number; visible: boolean }
/** 바탕 이미지의 기본값: 면을 덮는 "채우기" */
export const defaultUnderlay = (): UnderlayState => ({ ...defaultState(), fit: 'cover', opacity: 1, visible: true });

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

/** 바탕 이미지 한 장(합성에 쓰이는 데이터) */
export interface UnderlayDraw { img: CanvasImageSource; iw: number; ih: number; state: UnderlayState; onTop: boolean }

/** 레이어 한 장을 그린다. 'tile' 은 무늬를 반복해 면 전체를 덮는다. */
function drawLayer(ctx: CanvasRenderingContext2D, cw: number, ch: number, img: CanvasImageSource, iw: number, ih: number, s: SurfaceState, alpha = 1) {
  const l = computeLayout(cw, ch, iw, ih, s);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(l.cx, l.cy);
  ctx.scale(l.fx, l.fy);
  ctx.rotate(l.rot);
  ctx.imageSmoothingQuality = 'high';
  if (s.fit === 'tile') {
    const tw = Math.max(8, l.w), th = Math.max(8, l.h);
    const rw = Math.max(1, Math.round(tw)), rh = Math.max(1, Math.round(th));
    const tc = document.createElement('canvas');
    tc.width = rw; tc.height = rh;
    const tg = tc.getContext('2d')!;
    tg.imageSmoothingQuality = 'high';
    tg.drawImage(img, 0, 0, rw, rh);
    const pat = ctx.createPattern(tc, 'repeat');
    if (pat) {
      pat.setTransform(new DOMMatrix([tw / rw, 0, 0, th / rh, -tw / 2, -th / 2])); // 타일 한 장의 중심이 레이어 중심에 오도록
      ctx.fillStyle = pat;
      const reach = Math.hypot(cw, ch) * 2; // 회전·이동을 해도 캔버스 전체가 덮이는 반경
      ctx.fillRect(-reach, -reach, reach * 2, reach * 2);
    }
  } else ctx.drawImage(img, -l.w / 2, -l.h / 2, l.w, l.h);
  ctx.restore();
}

/** 캔버스에 구워 넣는다. 이미지가 없으면 호출하지 않는다. 합성 순서: 면 바탕색 → (바탕 이미지) → 디자인 이미지. under.onTop 이면 바탕 이미지가 디자인 이미지 위에 온다. */
export function bake(ctx: CanvasRenderingContext2D, cw: number, ch: number, img: CanvasImageSource, iw: number, ih: number, s: SurfaceState, bg = '#ffffff', under?: UnderlayDraw | null) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = bg; // 투명 픽셀/여백은 면 바탕색(기본 흰색)
  ctx.fillRect(0, 0, cw, ch);
  ctx.beginPath();
  ctx.rect(0, 0, cw, ch);
  ctx.clip(); // 면 밖으로 그려지지 않도록
  const u = under && under.state.visible && under.state.opacity > 0 ? under : null; // 없거나 꺼져 있으면 예전과 똑같이 그린다
  if (u && !u.onTop) drawLayer(ctx, cw, ch, u.img, u.iw, u.ih, u.state, u.state.opacity);
  if (!u) {
    const l = computeLayout(cw, ch, iw, ih, s);
    ctx.translate(l.cx, l.cy);
    ctx.scale(l.fx, l.fy);
    ctx.rotate(l.rot);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, -l.w / 2, -l.h / 2, l.w, l.h);
  } else drawLayer(ctx, cw, ch, img, iw, ih, s);
  if (u && u.onTop) drawLayer(ctx, cw, ch, u.img, u.iw, u.ih, u.state, u.state.opacity);
  ctx.restore();
}

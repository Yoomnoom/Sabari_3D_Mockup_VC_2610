// 칼선 이미지의 방향(0°/90°/180°/270°) 판정. 화면(DOM)에 의존하지 않는 순수 계산이다.
// 회전값 rot 는 "저장된 이미지를 시계방향으로 이만큼 돌리면 칼선 기준의 정립 방향이 된다"는 뜻이다.
import { ARTBOARD_PRESETS, CROP_SABARI_160_110_43_OFFSET_MM, CROP_SABARI_160_110_43_SIZE_MM, DieKind, Dieline, Rect, artboardRegions, cropRegions, regionsFor } from './dieline';

export type ImgRot = 0 | 90 | 180 | 270;
export const ROTS: ImgRot[] = [0, 90, 180, 270];

/** 불투명(1)/투명(0) 격자 */
export interface Grid { w: number; h: number; a: Uint8Array }

/** 판정 기준 하나: 칼선 외곽 비율(w:h)과 허용 오차, 면 영역(w×h 좌표계의 사각형) */
export interface OrientRef { id: 'crop' | 'artboard' | 'param'; w: number; h: number; tol: number; rects: Rect[] }

// 임계값: 크롭·아트보드는 기존 모드 판정과 같은 ±1%, 파라미터 칼선은 여분 값이 사용자마다 달라 ±3%.
// 모양 일치(IoU) 0.80 미만이면 모양이 칼선과 다른 그림으로 보고 비율만 쓴다. 두 후보의 IoU 차이가 0.03 이내면 구분 불가로 본다.
export const TOL_FIXED = 0.01, TOL_PARAM = 0.03, IOU_MIN = 0.8, IOU_TIE = 0.03;

export const rotatedSize = (w: number, h: number, rot: ImgRot): [number, number] => (rot === 90 || rot === 270 ? [h, w] : [w, h]);
export const addRot = (a: ImgRot, b: number): ImgRot => ((((a + b) % 360) + 360) % 360) as ImgRot;
export const rotLabel = (r: ImgRot) => (r === 90 ? '오른쪽으로 90°' : r === 270 ? '왼쪽으로 90°' : r === 180 ? '180°' : '돌리지 않음');

/** 격자를 시계방향 rot 만큼 돌린다 */
export function rotateGrid(g: Grid, rot: ImgRot): Grid {
  if (rot === 0) return g;
  const [w, h] = rotatedSize(g.w, g.h, rot), a = new Uint8Array(w * h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const nx = rot === 90 ? g.h - 1 - y : rot === 180 ? g.w - 1 - x : y;
    const ny = rot === 90 ? x : rot === 180 ? g.h - 1 - y : g.w - 1 - x;
    a[ny * w + nx] = g.a[y * g.w + x];
  }
  return { w, h, a };
}

/** 점 (x,y) 를 크기 W×H 이미지에서 시계방향 rot 만큼 돌린 이미지의 좌표로 옮긴다 */
export function rotatePoint(x: number, y: number, W: number, H: number, rot: ImgRot): [number, number] {
  return rot === 90 ? [H - y, x] : rot === 180 ? [W - x, H - y] : rot === 270 ? [y, W - x] : [x, y];
}

/** 기준 사각형들의 합집합을 w×h 격자로 그린다(기준 좌표계 크기 ref.w×ref.h 를 격자에 늘여 맞춘다) */
export function refMask(ref: OrientRef, gw: number, gh: number): Grid {
  const a = new Uint8Array(gw * gh);
  for (const r of ref.rects) {
    const x0 = Math.max(0, Math.round((r.x / ref.w) * gw)), x1 = Math.min(gw, Math.round(((r.x + r.w) / ref.w) * gw));
    const y0 = Math.max(0, Math.round((r.y / ref.h) * gh)), y1 = Math.min(gh, Math.round(((r.y + r.h) / ref.h) * gh));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a[y * gw + x] = 1;
  }
  return { w: gw, h: gh, a };
}

export function iou(p: Grid, q: Grid): number {
  let i = 0, u = 0;
  for (let k = 0; k < p.a.length; k++) { const a = p.a[k], b = q.a[k]; if (a && b) i++; if (a || b) u++; }
  return u ? i / u : 0;
}

/** 알파 채널이 실제로 쓰였는지: 불투명 비율이 5%~95% 일 때만 모양 비교를 쓴다(전부 불투명하거나 전부 투명하면 의미가 없다) */
export function hasShape(g: Grid | undefined): g is Grid {
  if (!g) return false;
  let on = 0;
  for (const v of g.a) on += v;
  const f = on / g.a.length;
  return f > 0.05 && f < 0.95;
}

export interface OrientCand { rot: ImgRot; aspectErr: number; iou: number | null }
export interface OrientResult {
  /** upright: 회전 없이 맞음(안내 없음) · auto: 한 방향만 맞아 자동 적용 · choose: 90°/270° 등 구분이 안 되어 확인 필요 · none: 어느 방향도 비율이 맞지 않음 */
  status: 'upright' | 'auto' | 'choose' | 'none';
  rot: ImgRot;
  cands: OrientCand[];
}

/**
 * 네 방향을 평가한다. (a) 돌린 이미지의 가로세로 비율이 기준과 맞는지, (b) 알파 채널이 있으면 투명/불투명 모양이 기준 영역 합집합과 겹치는 정도.
 * 0° 와 180°(또는 90° 와 270°)는 비율이 같아 (b) 없이는 구분되지 않는다. 0° 가 후보에 있으면 현재 방향을 그대로 두고 안내하지 않는다.
 */
export function evaluateOrientation(imgW: number, imgH: number, ref: OrientRef, alpha?: Grid): OrientResult {
  let cands: OrientCand[] = [];
  for (const rot of ROTS) {
    const [w, h] = rotatedSize(imgW, imgH, rot);
    const err = Math.abs(w / h / (ref.w / ref.h) - 1);
    if (err <= ref.tol) cands.push({ rot, aspectErr: err, iou: null });
  }
  if (!cands.length) return { status: 'none', rot: 0, cands };
  if (hasShape(alpha)) {
    const scored = cands.map((c) => { const g = rotateGrid(alpha, c.rot); return { ...c, iou: iou(g, refMask(ref, g.w, g.h)) }; });
    const ok = scored.filter((c) => (c.iou ?? 0) >= IOU_MIN);
    if (ok.length) {
      const best = Math.max(...ok.map((c) => c.iou ?? 0));
      cands = ok.filter((c) => (c.iou ?? 0) >= best - IOU_TIE);
    } else cands = scored; // 모양이 기준과 다르면 비율만으로 판정한다
  }
  if (cands.some((c) => c.rot === 0)) return { status: 'upright', rot: 0, cands };
  if (cands.length === 1) return { status: 'auto', rot: cands[0].rot, cands };
  const pick = [...cands].sort((a, b) => (b.iou ?? 0) - (a.iou ?? 0) || ROTS.indexOf(a.rot) - ROTS.indexOf(b.rot))[0];
  return { status: 'choose', rot: pick.rot, cands };
}

// ---- 기준(OrientRef) 만들기: 면 영역 합집합은 dieline.ts 의 기존 배치 함수를 그대로 쓴다(중복 정의 금지) ----
const SCALE = 10; // 기준 좌표를 mm ×10 으로 만들어 정수 반올림 오차를 줄인다

export function cropRef(): OrientRef {
  const [cw, ch] = CROP_SABARI_160_110_43_SIZE_MM, p = ARTBOARD_PRESETS[0];
  const w = cw * SCALE, h = ch * SCALE;
  return { id: 'crop', w, h, tol: TOL_FIXED, rects: Object.values(cropRegions(p, 'lid', w, h, cw, ch, CROP_SABARI_160_110_43_OFFSET_MM)) };
}
/** 아트보드 전체 이미지: 뚜껑·몸통 십자형 면 영역을 모두 합친다 */
export function artboardRef(artW: number, artH: number): OrientRef {
  const p = ARTBOARD_PRESETS[0], w = artW * SCALE, h = artH * SCALE;
  const rects = (['lid', 'base'] as DieKind[]).flatMap((k) => Object.values(artboardRegions(p, k, w, h, artW, artH)));
  return { id: 'artboard', w, h, tol: TOL_FIXED, rects };
}
export function paramRef(layout: Dieline, bleedMm: number): OrientRef {
  const w = (layout.width + 2 * bleedMm) * SCALE, h = (layout.height + 2 * bleedMm) * SCALE;
  return { id: 'param', w, h, tol: TOL_PARAM, rects: Object.values(regionsFor(layout, w, h, bleedMm)) };
}

/**
 * 올린 이미지에서 칼선 기준과 방향을 함께 고른다. 회전 없는(0°) 판정은 기존 모드 판정과 같다:
 * 크롭(232:283 ±1%, 모서리 투명) → 아트보드(±1%) → 파라미터 칼선. 앞 기준부터 어느 방향이든 맞는 것을 고른다.
 * 어느 기준도 비율이 맞지 않으면 파라미터 칼선·회전 없음(기존과 같음)이다.
 */
export function detectOrientation(imgW: number, imgH: number, cornersTransparent: boolean, alpha: Grid | undefined, artW: number, artH: number, paramRefOf: () => OrientRef): { mode: 'crop' | 'artboard' | 'param'; res: OrientResult } {
  if (cornersTransparent) { const res = evaluateOrientation(imgW, imgH, cropRef(), alpha); if (res.status !== 'none') return { mode: 'crop', res }; }
  const ab = evaluateOrientation(imgW, imgH, artboardRef(artW, artH), alpha);
  if (ab.status !== 'none') return { mode: 'artboard', res: ab };
  const pr = evaluateOrientation(imgW, imgH, paramRefOf(), alpha);
  return { mode: 'param', res: pr.status === 'none' ? { status: 'upright', rot: 0, cands: [] } : pr };
}

// 작업 13: 화면 배경(투명 체크무늬 / 흰색 / 단색 / 이미지). 배경은 3D 박스 뒤의 별도 2D 캔버스에 그려 박스를 돌려도 화면에 고정되고 박스 앞을 가리지 않는다.
// 화면 배경과 PNG "화면 그대로" 합성이 같은 그리기 함수(drawBackground)를 써서 둘이 구조적으로 같다. 배경은 GLB에는 들어가지 않는다.
import { UserError, inspectImage } from './project';

export type BgKind = 'transparent' | 'white' | 'solid' | 'image';
export interface BgImageSettings { fit: 'contain' | 'cover'; x: number; y: number; scale: number; sample: number | null }
export interface BgSettings { kind: BgKind; color: string; checkerDark: boolean; image: BgImageSettings }

export const DEFAULT_BG: BgSettings = { kind: 'white', color: '#808080', checkerDark: false, image: { fit: 'cover', x: 0, y: 0, scale: 100, sample: null } };
export const BG_KINDS: BgKind[] = ['transparent', 'white', 'solid', 'image'];
export const BG_CHIPS: { name: string; color: string }[] = [
  { name: '검정', color: '#000000' }, { name: '흰색', color: '#ffffff' }, { name: '회색', color: '#808080' },
  { name: '마젠타', color: '#ff00ff' }, { name: '초록', color: '#00b050' }, { name: '파랑', color: '#0070ff' },
];
/** 코드로 만드는 샘플 배경(그라데이션 6개, 외부 이미지 없음) */
export const BG_SAMPLES: [string, string][] = [
  ['#ff9a9e', '#fad0c4'], ['#a18cd1', '#fbc2eb'], ['#84fab0', '#8fd3f4'], ['#fccb90', '#d57eeb'], ['#e0c3fc', '#8ec5fc'], ['#30cfd0', '#330867'],
];
export const BG_MAX_SIDE = 4096; // 화면 표시용으로는 긴 변 4096px 이내로 줄여 쓰고, 원본 바이트는 따로 보관한다

const HEX = /^#[0-9a-fA-F]{6}$/;
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** 저장 파일·임시저장에서 읽은 값을 안전하게 정리한다(없거나 깨지면 기본값). */
export function sanitizeBg(raw: unknown): BgSettings {
  const o = (raw ?? {}) as Record<string, unknown>;
  const im = (o.image ?? {}) as Record<string, unknown>;
  const sample = typeof im.sample === 'number' && Number.isInteger(im.sample) && im.sample >= 0 && im.sample < BG_SAMPLES.length ? im.sample : null;
  return {
    kind: BG_KINDS.includes(o.kind as BgKind) ? (o.kind as BgKind) : 'white',
    color: typeof o.color === 'string' && HEX.test(o.color) ? o.color.toLowerCase() : DEFAULT_BG.color,
    checkerDark: o.checkerDark === true,
    image: { fit: im.fit === 'contain' ? 'contain' : 'cover', x: num(im.x, -100, 100, 0), y: num(im.y, -100, 100, 0), scale: num(im.scale, 25, 300, 100), sample },
  };
}

export type BgSource = { img: CanvasImageSource; w: number; h: number } | null;

/** 샘플 번호의 그라데이션을 캔버스로 만든다(대각선 135°). */
export function makeSample(i: number): HTMLCanvasElement {
  const [a, b] = BG_SAMPLES[i];
  const c = document.createElement('canvas'); c.width = 1600; c.height = 1000;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, c.width, c.height); gr.addColorStop(0, a); gr.addColorStop(1, b);
  g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** 이미지 파일을 읽어 표시용(긴 변 4096px 이내) 캔버스로 줄인다. 형식이 틀리면 UserError. */
export async function loadBgImage(blob: Blob): Promise<{ canvas: HTMLCanvasElement; w: number; h: number; ext: string }> {
  const info = await inspectImage(blob); // PNG/JPG/WebP만, 50MB 이하
  const long = Math.max(info.width, info.height), k = long > BG_MAX_SIDE ? BG_MAX_SIDE / long : 1;
  const tw = Math.max(1, Math.round(info.width * k)), th = Math.max(1, Math.round(info.height * k));
  const bmp = await createImageBitmap(blob, k < 1 ? { resizeWidth: tw, resizeHeight: th, resizeQuality: 'high' } : undefined).catch(() => { throw new UserError('이미지를 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.'); });
  const canvas = document.createElement('canvas'); canvas.width = bmp.width; canvas.height = bmp.height;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close();
  return { canvas, w: info.width, h: info.height, ext: info.ext };
}

const CHECKER_CELL = 14;
/**
 * 배경을 w×h 캔버스에 그린다. checker=true 는 화면 전용(투명일 때 체크무늬를 보여 준다). PNG 합성에서는 false 라 투명은 투명 그대로다.
 * 이미지는 맞춤(contain)/채우기(cover) 기준 배율에 확대(%)를 곱하고, 위치 X·Y(%)는 캔버스 크기에 대한 비율이라 화면과 PNG에서 같은 구도가 된다.
 */
export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, s: BgSettings, src: BgSource, checker: boolean) {
  ctx.clearRect(0, 0, w, h);
  if (s.kind === 'white') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); return; }
  if (s.kind === 'solid') { ctx.fillStyle = s.color; ctx.fillRect(0, 0, w, h); return; }
  if (s.kind === 'transparent') {
    if (!checker) return;
    const [c1, c2] = s.checkerDark ? ['#7a7a7a', '#5c5c5c'] : ['#ffffff', '#e4e4e4'];
    const cell = CHECKER_CELL;
    for (let y = 0, r = 0; y < h; y += cell, r++) for (let x = 0, c = 0; x < w; x += cell, c++) { ctx.fillStyle = (r + c) % 2 ? c2 : c1; ctx.fillRect(x, y, cell, cell); }
    return;
  }
  // 이미지: 여백(맞춤)은 흰색
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  if (!src || src.w <= 0 || src.h <= 0) return;
  const base = s.image.fit === 'cover' ? Math.max(w / src.w, h / src.h) : Math.min(w / src.w, h / src.h);
  const sc = base * (s.image.scale / 100);
  const dw = src.w * sc, dh = src.h * sc;
  const dx = (w - dw) / 2 + (s.image.x / 100) * (w / 2), dy = (h - dh) / 2 + (s.image.y / 100) * (h / 2);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src.img, dx, dy, dw, dh);
}

/** B 키 순환 순서: 흰색 → 투명 → 단색 → 이미지(있을 때) → 흰색 */
export function nextKind(cur: BgKind, hasImage: boolean): BgKind {
  const order: BgKind[] = hasImage ? ['white', 'transparent', 'solid', 'image'] : ['white', 'transparent', 'solid'];
  const i = order.indexOf(cur);
  return order[(i + 1) % order.length] ?? 'white';
}

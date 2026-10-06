import { SurfaceState, UnderlayState, bake, defaultState, textureSize } from './transform';
import { FACES, FaceId, groupOf } from './faceDefs';

export { FACES, groupOf };
export type { FaceId };

/** 면 바탕색: 이미지 없는 면, 투명 픽셀, "전체 보이기" 여백에 쓴다. */
export const theme = { faceBg: '#ffffff', baseBg: '#efece7' };

/** 하단 면은 "몸통" 색, 뚜껑 면은 "면 바탕" 색을 쓴다. */
export const bgFor = (id: FaceId): string => (groupOf(id) === 'base' ? theme.baseBg : theme.faceBg);

/** 바탕 이미지(아래 레이어): 원본 바이트(blob)는 그대로, img 는 긴 변 4096px 이내로 줄인 표시용 */
export interface UnderData {
  state: UnderlayState;
  blob: Blob;
  name: string | null;
  img: ImageBitmap;
  iw: number; ih: number;
  /** 원본 크기(px) */
  ow: number; oh: number;
}

export interface FaceSnapshot {
  state: SurfaceState;
  blob: Blob | null;
  name: string | null;
  img: ImageBitmap | null;
  iw: number;
  ih: number;
  /** 바탕 이미지(선택). 없으면 null */
  under: UnderData | null;
  /** true 면 바탕 이미지가 디자인 이미지 위에 온다("순서 바꾸기") */
  underOnTop: boolean;
}

export const UNDER_MAX_SIDE = 4096;

export interface FaceData extends FaceSnapshot {
  id: FaceId;
  canvas: HTMLCanvasElement; // 구워진 텍스처 (미리보기·GLB 공용)
}

export const faces: Record<FaceId, FaceData> = Object.fromEntries(
  FACES.map((f) => {
    const [w, h] = textureSize(f.wMm, f.hMm);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const d: FaceData = { id: f.id, state: defaultState(), blob: null, name: null, img: null, iw: 0, ih: 0, under: null, underOnTop: false, canvas };
    return [f.id, d];
  }),
) as Record<FaceId, FaceData>;

const MAX_SIDE = 12000;

export async function decode(blob: Blob): Promise<{ img: ImageBitmap; iw: number; ih: number }> {
  let img = await createImageBitmap(blob);
  const iw = img.width, ih = img.height;
  if (Math.max(iw, ih) > MAX_SIDE) {
    // 미리보기용 복사본만 축소한다. blob(원본)은 그대로 둔다.
    const k = MAX_SIDE / Math.max(iw, ih);
    img.close();
    img = await createImageBitmap(blob, { resizeWidth: Math.round(iw * k), resizeHeight: Math.round(ih * k), resizeQuality: 'high' });
  }
  return { img, iw: img.width, ih: img.height };
}

/** 바탕 이미지를 읽는다. 표시용 비트맵은 긴 변 4096px 이내로 줄이고 원본(blob)은 그대로 둔다. */
export async function decodeUnder(blob: Blob): Promise<{ img: ImageBitmap; iw: number; ih: number; ow: number; oh: number }> {
  let img = await createImageBitmap(blob);
  const ow = img.width, oh = img.height;
  if (Math.max(ow, oh) > UNDER_MAX_SIDE) {
    const k = UNDER_MAX_SIDE / Math.max(ow, oh);
    img.close();
    img = await createImageBitmap(blob, { resizeWidth: Math.max(1, Math.round(ow * k)), resizeHeight: Math.max(1, Math.round(oh * k)), resizeQuality: 'high' });
  }
  return { img, iw: img.width, ih: img.height, ow, oh };
}

/** 상태를 캔버스에 다시 굽는다. 이미지가 없으면 false. */
export function rebake(f: FaceData): boolean {
  const ctx = f.canvas.getContext('2d')!;
  if (!f.img) {
    ctx.clearRect(0, 0, f.canvas.width, f.canvas.height);
    return false;
  }
  bake(ctx, f.canvas.width, f.canvas.height, f.img, f.iw, f.ih, f.state, bgFor(f.id), f.under ? { img: f.under.img, iw: f.under.iw, ih: f.under.ih, state: f.under.state, onTop: f.underOnTop } : null);
  return true;
}

/** 면 크기(mm)가 바뀌었을 때 구워진 텍스처 캔버스 크기를 맞춘다. 크기가 바뀐 캔버스는 비워지므로 호출한 쪽이 rebake 한다. */
export function resizeFaceCanvases() {
  for (const fd of FACES) {
    const f = faces[fd.id];
    const [w, h] = textureSize(fd.wMm, fd.hMm);
    if (f.canvas.width !== w || f.canvas.height !== h) { f.canvas.width = w; f.canvas.height = h; }
  }
}

import { SurfaceState, bake, defaultState, textureSize } from './transform';

export type FaceId = 'lid_top' | 'lid_front' | 'lid_back' | 'lid_left' | 'lid_right';

// 크기(mm)는 backend/app/template_gen.py 의 FACES / faceSizeMm 와 같아야 한다.
export const FACES: { id: FaceId; label: string; wMm: number; hMm: number }[] = [
  { id: 'lid_top', label: '상단', wMm: 165, hMm: 115 },
  { id: 'lid_front', label: '앞날개', wMm: 165, hMm: 38 },
  { id: 'lid_back', label: '뒷날개', wMm: 165, hMm: 38 },
  { id: 'lid_left', label: '왼쪽 날개', wMm: 115, hMm: 38 },
  { id: 'lid_right', label: '오른쪽 날개', wMm: 115, hMm: 38 },
];

export interface FaceSnapshot {
  state: SurfaceState;
  blob: Blob | null;
  name: string | null;
  img: ImageBitmap | null;
  iw: number;
  ih: number;
}

export interface FaceData extends FaceSnapshot {
  id: FaceId;
  canvas: HTMLCanvasElement; // 구워진 텍스처 (미리보기·GLB 공용)
  undo: FaceSnapshot | null; // 제거/초기화 직전 상태 1단계
}

export const faces: Record<FaceId, FaceData> = Object.fromEntries(
  FACES.map((f) => {
    const [w, h] = textureSize(f.wMm, f.hMm);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const d: FaceData = { id: f.id, state: defaultState(), blob: null, name: null, img: null, iw: 0, ih: 0, canvas, undo: null };
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

/** 상태를 캔버스에 다시 굽는다. 이미지가 없으면 false. */
export function rebake(f: FaceData): boolean {
  const ctx = f.canvas.getContext('2d')!;
  if (!f.img) {
    ctx.clearRect(0, 0, f.canvas.width, f.canvas.height);
    return false;
  }
  bake(ctx, f.canvas.width, f.canvas.height, f.img, f.iw, f.ih, f.state);
  return true;
}

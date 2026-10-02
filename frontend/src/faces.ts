import { SurfaceState, bake, defaultState, textureSize } from './transform';
import { FACES, FaceId, groupOf } from './faceDefs';

export { FACES, groupOf };
export type { FaceId };

/** 면 바탕색: 이미지 없는 면, 투명 픽셀, "전체 보이기" 여백에 쓴다. */
export const theme = { faceBg: '#ffffff', baseBg: '#efece7' };

/** 하단 면은 "몸통" 색, 뚜껑 면은 "면 바탕" 색을 쓴다. */
export const bgFor = (id: FaceId): string => (groupOf(id) === 'base' ? theme.baseBg : theme.faceBg);

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
}

export const faces: Record<FaceId, FaceData> = Object.fromEntries(
  FACES.map((f) => {
    const [w, h] = textureSize(f.wMm, f.hMm);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const d: FaceData = { id: f.id, state: defaultState(), blob: null, name: null, img: null, iw: 0, ih: 0, canvas };
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
  bake(ctx, f.canvas.width, f.canvas.height, f.img, f.iw, f.ih, f.state, bgFor(f.id));
  return true;
}

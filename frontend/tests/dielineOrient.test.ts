import { describe, expect, it } from 'vitest';
import { ImgRot, ROTS, Grid, addRot, artboardRef, cropRef, detectOrientation, evaluateOrientation, refMask, rotateGrid, rotatePoint, rotatedSize } from '../src/dielineOrient';

/** 기준 영역 합집합을 이미지 격자로 만든 합성 "십자형 알파" (크기: 가로 폭 기준 64칸) */
function synthAlpha(ref = cropRef(), cols = 58): Grid {
  const rows = Math.round((cols * ref.h) / ref.w);
  return refMask(ref, cols, rows);
}
const inverse = (r: ImgRot): ImgRot => addRot(0, 360 - r);

describe('격자 회전', () => {
  it('90° 네 번은 원래 격자, 90° 후 270° 는 원래 격자', () => {
    const g = synthAlpha();
    let x = g;
    for (let i = 0; i < 4; i++) x = rotateGrid(x, 90);
    expect(Array.from(x.a)).toEqual(Array.from(g.a));
    expect(Array.from(rotateGrid(rotateGrid(g, 90), 270).a)).toEqual(Array.from(g.a));
    expect(Array.from(rotateGrid(rotateGrid(g, 180), 180).a)).toEqual(Array.from(g.a));
  });
  it('점 이동은 격자 회전과 같다', () => {
    const W = 5, H = 3;
    for (const rot of [90, 180, 270] as ImgRot[]) {
      const g: Grid = { w: W, h: H, a: new Uint8Array(W * H) };
      g.a[1 * W + 3] = 1; // (x=3,y=1)
      const r = rotateGrid(g, rot);
      const [px, py] = rotatePoint(3.5, 1.5, W, H, rot), nx = Math.floor(px), ny = Math.floor(py); // 칸 중심 좌표
      expect(r.a[ny * r.w + nx]).toBe(1);
    }
  });
});

describe('크롭 이미지(232:283) 방향 판정', () => {
  const ref = cropRef();
  const W = 232 * 4, H = 283 * 4;
  const upright = synthAlpha(ref);
  it('정립(0°)이면 안내 없이 upright', () => {
    const r = evaluateOrientation(W, H, ref, upright);
    expect(r.status).toBe('upright'); expect(r.rot).toBe(0);
  });
  it('90°·270° 돌려 저장하면 되돌리는 방향을 찾는다(비대칭 모양이면 한 방향)', () => {
    for (const saved of [90, 270] as ImgRot[]) {
      const g = rotateGrid(upright, saved);
      const [w, h] = rotatedSize(W, H, saved);
      const r = evaluateOrientation(w, h, ref, g);
      const want = inverse(saved);
      expect(r.cands.map((c) => c.rot)).toContain(want);
      if (r.status === 'auto') expect(r.rot).toBe(want);
      else expect(r.status).toBe('choose');
    }
  });
  it('180° 로 저장하면 모양이 비대칭일 때 180° 로 자동 인식, 대칭이면 0° 유지', () => {
    const g = rotateGrid(upright, 180);
    const r = evaluateOrientation(W, H, ref, g);
    const sym = Array.from(g.a).every((v, i) => v === upright.a[i]);
    if (sym) expect(r.status).toBe('upright'); else { expect(r.status).toBe('auto'); expect(r.rot).toBe(180); }
  });
  it('알파가 없으면 비율만: 가로로 저장된 이미지는 90°/270° 중 확인 필요, 세로면 안내 없음', () => {
    expect(evaluateOrientation(W, H, ref).status).toBe('upright');
    const r = evaluateOrientation(H, W, ref);
    expect(r.status).toBe('choose');
    expect(r.cands.map((c) => c.rot).sort((a, b) => a - b)).toEqual([90, 270]);
  });
  it('비율이 안 맞으면 none', () => {
    expect(evaluateOrientation(1000, 1000, ref).status).toBe('none');
    expect(evaluateOrientation(W * 1.03, H, ref).status).toBe('none');
  });
});

describe('아트보드(525.7×349.0) 방향 판정', () => {
  const ref = artboardRef(525.7, 349.0);
  it('가로 이미지는 정립, 세로로 저장된 이미지는 90°/270° 후보', () => {
    expect(evaluateOrientation(5257, 3490, ref).status).toBe('upright');
    const r = evaluateOrientation(3490, 5257, ref);
    expect(r.status).toBe('choose');
    expect(r.cands.map((c) => c.rot).sort((a, b) => a - b)).toEqual([90, 270]);
  });
});

describe('기준 자동 선택', () => {
  it('세로로 저장된 아트보드 이미지는 아트보드 기준 + 회전 후보', () => {
    const d = detectOrientation(3490, 5257, false, undefined, 525.7, 349.0, () => { throw new Error('param 은 필요 없다'); });
    expect(d.mode).toBe('artboard'); expect(d.res.status).toBe('choose');
  });
  it('가로로 저장된 크롭 이미지(알파 있음)는 크롭 기준 + 올바른 방향 후보', () => {
    const ref = cropRef(), up = synthAlpha(ref), g = rotateGrid(up, 90);
    const d = detectOrientation(283 * 4, 232 * 4, true, g, 525.7, 349.0, () => ref);
    expect(d.mode).toBe('crop');
    expect(d.res.cands.map((c) => c.rot)).toContain(270);
  });
  it('어느 기준도 맞지 않으면 파라미터 칼선·회전 없음', () => {
    const ref = cropRef();
    const d = detectOrientation(1000, 1000, false, undefined, 525.7, 349.0, () => ({ ...ref, id: 'param', w: 100, h: 300 }));
    expect(d.mode).toBe('param'); expect(d.res.status).toBe('upright'); expect(d.res.rot).toBe(0);
  });
});

describe('회전값 연산', () => {
  it('addRot', () => {
    expect(addRot(270, 90)).toBe(0); expect(addRot(0, -90)).toBe(270); expect(addRot(90, 180)).toBe(270);
    expect(ROTS.map((r) => addRot(r, 360))).toEqual(ROTS);
  });
});

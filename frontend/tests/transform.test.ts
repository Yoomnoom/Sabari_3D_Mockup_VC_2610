import { describe, expect, it } from 'vitest';
import { computeLayout, defaultState, textureSize } from '../src/transform';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('computeLayout', () => {
  it('contain: 2:1 이미지를 길쭉한 날개면(165x38)에 맞추면 높이에 맞는다', () => {
    const [cw, ch] = textureSize(165, 38);
    const l = computeLayout(cw, ch, 2000, 1000, defaultState());
    close(l.h, ch);
    close(l.w, ch * 2);
    expect(l.w).toBeLessThanOrEqual(cw);
  });
  it('cover: 면을 가득 채운다', () => {
    const l = computeLayout(1000, 400, 2000, 1000, { ...defaultState(), fit: 'cover' });
    close(l.w, 1000);
    expect(l.h).toBeGreaterThanOrEqual(400);
  });
  it('90° 회전은 가로세로를 바꿔 맞춘다', () => {
    const l = computeLayout(1000, 500, 400, 200, { ...defaultState(), rotationDeg: 90 });
    // 회전 후 200x400 → 높이 500에 맞춤 → scale 1.25, 그리기 크기 500x250
    close(l.w, 500); close(l.h, 250); close(l.rot, Math.PI / 2);
  });
  it('배율·오프셋·반전', () => {
    const l = computeLayout(1000, 500, 1000, 500, { ...defaultState(), scale: 1.2, offsetX: 0.1, offsetY: -0.2, flipX: true });
    close(l.w, 1200); close(l.cx, 600); close(l.cy, 150); expect(l.fx).toBe(-1); expect(l.fy).toBe(1);
  });
  it('textureSize 비율 유지', () => {
    expect(textureSize(165, 115)).toEqual([2048, 1427]);
    expect(textureSize(115, 38)).toEqual([2048, 677]);
  });
});

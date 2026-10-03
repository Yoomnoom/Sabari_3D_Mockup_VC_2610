import { describe, expect, it } from 'vitest';
import { SNAP_DEG, dragRotation } from '../src/screenRotate';

describe('screen rotation drag', () => {
  it('화면 높이만큼 끌면 360°', () => {
    expect(dragRotation(900, 900, false).deg).toBeCloseTo(360, 9);
    expect(dragRotation(-450, 900, false).deg).toBeCloseTo(-180, 9);
  });
  it('제한이 없다: 높이의 5배를 끌면 1800°', () => {
    expect(dragRotation(4500, 900, false).deg).toBeCloseTo(1800, 9);
  });
  it('Ctrl 스냅은 15° 단위', () => {
    expect(SNAP_DEG).toBe(15);
    for (const px of [-300, -37, -3, 0, 3, 40, 123, 777]) {
      const r = dragRotation(px, 900, true);
      expect(r.snapped).toBe(true);
      expect(Math.abs(r.deg % 15)).toBeCloseTo(0, 9);
      expect(Math.abs(r.deg - (px / 900) * 360)).toBeLessThanOrEqual(7.5 + 1e-9);
    }
    expect(Object.is(dragRotation(-1, 900, true).deg, 0)).toBe(true);
  });
});

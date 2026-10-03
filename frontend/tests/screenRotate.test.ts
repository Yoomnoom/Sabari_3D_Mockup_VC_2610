import { describe, expect, it } from 'vitest';
import { SNAP_DEG, dragRotation, lockedStep, trackballPoint } from '../src/screenRotate';

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

describe('축 잠금 회전(트랙볼 구면)', () => {
  const R = 100;
  it('구면 점은 연속이다: 구 안팎 경계에서 값이 튀지 않는다', () => {
    let prev = trackballPoint(0, 0, R);
    for (let r = 1; r <= 300; r++) {
      const p = trackballPoint(r, 0, R);
      expect(Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2])).toBeLessThan(2.2);
      prev = p;
    }
    expect(trackballPoint(0, 0, R)[2]).toBeCloseTo(R, 9);
    expect(trackballPoint(500, 0, R)[2]).toBeGreaterThan(0);
  });
  it('축이 화면 가로(x)면 세로 이동만 회전, 가로 이동은 0', () => {
    const a: [number, number, number] = [1, 0, 0];
    expect(lockedStep(a, 40, 0, 0, 10, R)).not.toBe(0);
    expect(Math.abs(lockedStep(a, 40, 0, 10, 0, R))).toBeLessThan(1e-12);
  });
  it('축이 화면 세로(y)면 가로 이동만 회전', () => {
    const a: [number, number, number] = [0, 1, 0];
    expect(lockedStep(a, 0, 40, 10, 0, R)).not.toBe(0);
    expect(Math.abs(lockedStep(a, 0, 40, 0, 10, R))).toBeLessThan(1e-12);
  });
  it('축이 카메라를 향하면 중심을 도는 원형 이동이 회전(반시계 = +)', () => {
    const a: [number, number, number] = [0, 0, 1];
    expect(lockedStep(a, 60, 0, 0, 5, R)).toBeGreaterThan(0); // 오른쪽에서 위로 = 반시계
    expect(lockedStep(a, 0, 60, -5, 0, R)).toBeGreaterThan(0);
    expect(lockedStep(a, 60, 0, 0, -5, R)).toBeLessThan(0);
  });
  it('각이 축 기울기에 연속: 같은 이동에서 축을 평면→카메라 방향으로 돌려도 값이 튀지 않는다', () => {
    let prev = NaN, maxJump = 0;
    for (let d = 90; d >= 0; d--) { // 축과 시선의 각
      const t = (d * Math.PI) / 180, a: [number, number, number] = [Math.sin(t), 0, Math.cos(t)];
      const v = lockedStep(a, 50, 30, 0, 6, R);
      if (!Number.isNaN(prev)) maxJump = Math.max(maxJump, Math.abs(v - prev));
      prev = v;
    }
    expect(maxJump).toBeLessThan(0.01);
  });
  it('축 위의 점을 잡으면(중심, 카메라 향한 축) 멈출 뿐 튀지 않는다', () => {
    expect(lockedStep([0, 0, 1], 0, 0, 5, 5, R)).toBe(0);
  });
});
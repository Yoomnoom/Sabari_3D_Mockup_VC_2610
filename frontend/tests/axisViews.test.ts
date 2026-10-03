import { describe, expect, it } from 'vitest';
import { AXIS_VIEW_NAMES, viewAxisLocal } from '../src/viewDirs';

const a = (n: Parameters<typeof viewAxisLocal>[0]) => viewAxisLocal(n).toArray().map((x) => +x.toFixed(9));
describe('회전축 버튼의 축(시점 방향 상수에서 도출)', () => {
  it('버튼은 7개이고 3/4 는 iso', () => {
    expect(AXIS_VIEW_NAMES).toEqual(['front', 'back', 'left', 'right', 'top', 'bottom', 'iso']);
  });
  it('마주 보는 시점은 같은 선: 정면/후면 = 앞뒤(z), 좌측/우측 = 좌우(x), 윗면/아래 = 위아래(y)', () => {
    expect(a('front')).toEqual([0, 0, 1]); expect(a('back')).toEqual([0, 0, 1]);
    expect(a('left')).toEqual([1, 0, 0]); expect(a('right')).toEqual([1, 0, 0]);
    expect(a('top')).toEqual([0, 1, 0]); expect(a('bottom')).toEqual([0, 1, 0]);
  });
  it('3/4 는 3/4 시점의 시선 방향(대각선) 단위벡터', () => {
    const v = viewAxisLocal('iso');
    expect(v.length()).toBeCloseTo(1, 9);
    expect(Math.abs(v.x)).toBeGreaterThan(0.3); expect(Math.abs(v.y)).toBeGreaterThan(0.3); expect(Math.abs(v.z)).toBeGreaterThan(0.3);
    expect(v.x).toBeGreaterThan(0); expect(v.y).toBeGreaterThan(0); expect(v.z).toBeGreaterThan(0); // 3/4 오른쪽(iso) 시점: 앞·오른쪽·위
  });
});

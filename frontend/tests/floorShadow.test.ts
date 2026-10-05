import { describe, expect, it } from 'vitest';
import { DEFAULT_SHADOW, sanitizeShadow } from '../src/floorShadow';

describe('바닥 그림자 설정', () => {
  it('기본값은 꺼짐이고 세기 40%·부드러움 50%·뒤 왼쪽 위(225°, 65°) 빛이다', () => {
    expect(DEFAULT_SHADOW).toEqual({ on: false, strength: 0.4, soft: 0.5, az: 225, el: 65 });
    expect(sanitizeShadow(null)).toEqual(DEFAULT_SHADOW);
    expect(sanitizeShadow({})).toEqual(DEFAULT_SHADOW);
  });
  it('범위를 벗어난 값은 제한하고 좌우 각은 0~360으로 순환한다', () => {
    const s = sanitizeShadow({ on: true, strength: 3, soft: -1, az: 400, el: 5 });
    expect(s).toEqual({ on: true, strength: 1, soft: 0, az: 40, el: 20 });
    expect(sanitizeShadow({ az: -30 }).az).toBe(330);
    expect(sanitizeShadow({ el: 99 }).el).toBe(80);
  });
  it('깨진 저장값(문자열·NaN)은 기본값으로 되돌린다', () => {
    const s = sanitizeShadow({ on: 'yes' as unknown as boolean, strength: 'x' as unknown as number, soft: NaN, az: Infinity, el: null as unknown as number });
    expect(s).toEqual(DEFAULT_SHADOW);
  });
});

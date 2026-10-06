import { describe, expect, it } from 'vitest';
import { DEFAULT_SHADOW, sanitizeShadow } from '../src/floorShadow';

describe('바닥 그림자 설정', () => {
  it('기본값은 꺼짐이고 세기 40%·부드러움 50%·뒤 왼쪽 위(225°, 65°) 빛이다', () => {
    expect(DEFAULT_SHADOW).toEqual({ on: false, strength: 0.4, soft: 0.5, az: 225, el: 65, style: 'default' });
    expect(sanitizeShadow(null)).toEqual(DEFAULT_SHADOW);
    expect(sanitizeShadow({})).toEqual(DEFAULT_SHADOW);
  });
  it('범위를 벗어난 값은 제한하고 좌우 각은 0~360으로 순환한다', () => {
    const s = sanitizeShadow({ on: true, strength: 3, soft: -1, az: 400, el: 5 });
    expect(s).toEqual({ on: true, strength: 1, soft: 0, az: 40, el: 20, style: 'default' });
    expect(sanitizeShadow({ az: -30 }).az).toBe(330);
    expect(sanitizeShadow({ el: 99 }).el).toBe(80);
  });
  it('깨진 저장값(문자열·NaN)은 기본값으로 되돌린다', () => {
    const s = sanitizeShadow({ on: 'yes' as unknown as boolean, strength: 'x' as unknown as number, soft: NaN, az: Infinity, el: null as unknown as number });
    expect(s).toEqual(DEFAULT_SHADOW);
  });
});

import { SHADOW_STYLES, sanitizeShadow as sanitizeShadow25, DEFAULT_SHADOW as DEFAULT_SHADOW25 } from '../src/floorShadow';
describe('그림자 스타일(작업 25)', () => {
  it('기본 스타일은 기본(현재와 같음)이고 알 수 없는 값은 기본으로', () => {
    expect(DEFAULT_SHADOW25.style).toBe('default');
    expect(sanitizeShadow25({ style: 'zzz' as never }).style).toBe('default');
    expect(sanitizeShadow25(null).style).toBe('default');
    for (const st of SHADOW_STYLES) expect(sanitizeShadow25({ style: st }).style).toBe(st);
  });
  it('스타일이 없는 이전 저장값도 열린다', () => {
    expect(sanitizeShadow25({ on: true, strength: 0.3, soft: 0.2, az: 10, el: 30 })).toMatchObject({ on: true, style: 'default' });
  });
});

import { describe, expect, it } from 'vitest';
import { BG_CHIPS, BG_SAMPLES, DEFAULT_BG, nextKind, sanitizeBg } from '../src/background';

describe('배경 설정', () => {
  it('기본값은 흰색이고 이미지 없음', () => {
    expect(DEFAULT_BG.kind).toBe('white');
    expect(sanitizeBg(undefined)).toEqual(DEFAULT_BG);
    expect(sanitizeBg({})).toEqual(DEFAULT_BG);
  });
  it('깨진 값은 기본값으로, 범위는 제한한다', () => {
    const s = sanitizeBg({ kind: 'nope', color: 'red', checkerDark: 'x', image: { fit: 'contain', x: 999, y: -999, scale: 5, sample: 99 } });
    expect(s.kind).toBe('white'); expect(s.color).toBe(DEFAULT_BG.color); expect(s.checkerDark).toBe(false);
    expect(s.image).toEqual({ fit: 'contain', x: 100, y: -100, scale: 25, sample: null });
  });
  it('정상 값은 그대로 읽고 색은 소문자로 맞춘다', () => {
    const s = sanitizeBg({ kind: 'solid', color: '#FF00AA', checkerDark: true, image: { fit: 'cover', x: 10, y: -5, scale: 150, sample: 3 } });
    expect(s).toEqual({ kind: 'solid', color: '#ff00aa', checkerDark: true, image: { fit: 'cover', x: 10, y: -5, scale: 150, sample: 3 } });
  });
  it('B 키 순환: 흰색 → 투명 → 단색 → (이미지) → 흰색', () => {
    expect(nextKind('white', false)).toBe('transparent');
    expect(nextKind('transparent', false)).toBe('solid');
    expect(nextKind('solid', false)).toBe('white');
    expect(nextKind('solid', true)).toBe('image');
    expect(nextKind('image', true)).toBe('white');
  });
  it('빠른 색 칩 6개와 샘플 6개', () => {
    expect(BG_CHIPS.map((c) => c.name)).toEqual(['검정', '흰색', '회색', '마젠타', '초록', '파랑']);
    expect(BG_SAMPLES).toHaveLength(6);
  });
});

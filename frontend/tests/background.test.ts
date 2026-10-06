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
    expect(s).toEqual({ kind: 'solid', color: '#ff00aa', checkerDark: true, image: { fit: 'cover', x: 10, y: -5, scale: 150, sample: 3 }, studio: { wall: '#ffffff', floor: '#ffffff', vignette: 10, horizon: 60, horizonAuto: true } });
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

import { DEFAULT_STUDIO, sanitizeStudio, serializeBg, drawStudio } from '../src/background';
describe('스튜디오 배경(작업 25)', () => {
  it('필드가 없거나 깨지면 기본값(흰 스튜디오)', () => {
    expect(sanitizeStudio(undefined)).toEqual(DEFAULT_STUDIO);
    expect(sanitizeStudio({ wall: 'red', floor: 5, vignette: 'x', horizon: NaN, horizonAuto: 1 })).toEqual({ ...DEFAULT_STUDIO, horizonAuto: false });
  });
  it('범위 제한과 색 정규화', () => {
    expect(sanitizeStudio({ wall: '#AABBCC', floor: '#112233', vignette: 500, horizon: -9, horizonAuto: false })).toEqual({ wall: '#aabbcc', floor: '#112233', vignette: 100, horizon: 0, horizonAuto: false });
  });
  it('스튜디오가 아니고 기본값이면 저장 모양이 이전과 같다', () => {
    expect('studio' in serializeBg(DEFAULT_BG)).toBe(false);
    expect('studio' in serializeBg({ ...DEFAULT_BG, kind: 'studio' })).toBe(true);
    expect('studio' in serializeBg({ ...DEFAULT_BG, studio: { ...DEFAULT_STUDIO, wall: '#000000' } })).toBe(true);
  });
  it('스튜디오 종류는 저장된 값으로 열리고 알 수 없는 종류는 흰색', () => {
    expect(sanitizeBg({ kind: 'studio' }).kind).toBe('studio');
    expect(sanitizeBg({ kind: 'studioX' }).kind).toBe('white');
  });
  it('위쪽 벽이 바닥보다 어둡거나 같고 아래쪽이 약간 어둡다(흰 스튜디오)', () => {
    const stops: [number, string][] = [];
    const ctx = { createLinearGradient: () => ({ addColorStop: (t: number, c: string) => stops.push([t, c]) }), createRadialGradient: () => ({ addColorStop: () => {} }), fillRect: () => {}, set fillStyle(_v: unknown) {} } as unknown as CanvasRenderingContext2D;
    drawStudio(ctx, 100, 100, { ...DEFAULT_STUDIO, vignette: 0 });
    const v = (c: string) => Number(c.match(/\d+/)![0]);
    expect(v(stops[0][1])).toBeLessThan(255); // 맨 위 벽이 살짝 어둡다
    expect(v(stops.at(-1)![1])).toBeLessThan(v(stops[2][1])); // 바닥 맨 아래가 바닥 색보다 어둡다
  });
});

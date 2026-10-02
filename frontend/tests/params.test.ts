import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, BoxParams, derive, faceSizes, formatPct, formatRatio, paramsFromUnknown, paramsFromWrap, ratioChanges, validateParams, wrapFromParams, RATIO_ALERT_THRESHOLD } from '../src/params';

const P = (o: Partial<BoxParams> = {}): BoxParams => ({ ...DEFAULT_PARAMS, ...o });

describe('기본값', () => {
  it('현재 값과 같다 (몸통 160×110×43, 뚜껑 165×115×38, 합지 2, 여유 0.5)', () => {
    const d = derive(DEFAULT_PARAMS);
    expect([DEFAULT_PARAMS.baseW, DEFAULT_PARAMS.baseD, DEFAULT_PARAMS.baseH, DEFAULT_PARAMS.lidH, DEFAULT_PARAMS.board, DEFAULT_PARAMS.lidClearance]).toEqual([160, 110, 43, 38, 2, 0.5]);
    expect([d.lidW, d.lidD, d.closedH]).toEqual([165, 115, 45]);
  });
  it('가정값: 싸바리지 여유 2.4 → 칼선 샘플 패널 117.4×167.4 / 112.4×162.4', () => {
    const d = derive(DEFAULT_PARAMS);
    expect([d.lidWrapW, d.lidWrapD, d.baseWrapW, d.baseWrapD]).toEqual([167.4, 117.4, 162.4, 112.4]);
    expect(DEFAULT_PARAMS.tuck).toBe(19.3);
  });
  it('재단 여분은 치수와 분리된 값이다 (치수가 바뀌어도 여분은 그대로)', () => {
    expect(P({ baseW: 200 }).bleed).toBe(DEFAULT_PARAMS.bleed);
    expect(Object.keys(DEFAULT_PARAMS)).toContain('bleed');
  });
  it('기본 면 크기', () => {
    const s = faceSizes(DEFAULT_PARAMS);
    expect(s.lid_top).toEqual([165, 115]); expect(s.lid_front).toEqual([165, 38]); expect(s.lid_left).toEqual([115, 38]);
    expect(s.base_front).toEqual([160, 43]); expect(s.base_left).toEqual([110, 43]); expect(s.base_bottom).toEqual([160, 110]);
  });
});

describe('검증(불가능한 조합 거부)', () => {
  it('기본값은 통과', () => expect(validateParams(DEFAULT_PARAMS)).toEqual([]));
  it('음수·0·NaN', () => {
    expect(validateParams(P({ baseW: -5 })).join()).toContain('음수');
    expect(validateParams(P({ baseH: 0 })).join()).toContain('이상');
    expect(validateParams(P({ baseD: NaN })).join()).toContain('숫자');
  });
  it('뚜껑이 몸통보다 작아지는 조합(여유 < 0)', () => expect(validateParams(P({ lidClearance: -0.3 })).join()).toContain('음수'));
  it('두께가 치수 이상', () => {
    expect(validateParams(P({ board: 30 })).join()).toMatch(/두께/);
    expect(validateParams(P({ board: 20, baseW: 38, baseD: 38 })).join()).toContain('절반');
    expect(validateParams(P({ board: 6, baseH: 6, lidH: 20 })).join()).toContain('몸통 높이');
    expect(validateParams(P({ board: 6, baseH: 20, lidH: 6 })).join()).toContain('뚜껑 높이');
  });
  it('범위 밖', () => { expect(validateParams(P({ baseW: 5000 })).length).toBeGreaterThan(0); });
});

describe('입력 기준 변환(완성 외경 ↔ 싸바리지)', () => {
  it('외경 → 싸바리지 → 외경 왕복', () => {
    const w = wrapFromParams(DEFAULT_PARAMS);
    expect([w.lidWrapW, w.lidWrapD, w.lidWingDepth, w.baseWingDepth]).toEqual([167.4, 117.4, 38, 43]);
    expect(paramsFromWrap(w)).toEqual(DEFAULT_PARAMS);
    const q = P({ baseW: 200, baseD: 140, baseH: 60, lidH: 50, board: 1.5 });
    const back = paramsFromWrap(wrapFromParams(q));
    for (const k of Object.keys(q) as (keyof BoxParams)[]) expect(back[k]).toBeCloseTo(q[k], 6);
  });
  it('싸바리지 117.4×167.4 → 몸통 160×110', () => {
    const p = paramsFromWrap({ lidWrapW: 167.4, lidWrapD: 117.4, lidWingDepth: 38, baseWingDepth: 43, board: 2, lidClearance: 0.5, wrapMargin: 2.4, tuck: 19.3, bleed: 3 });
    expect([p.baseW, p.baseD]).toEqual([160, 110]);
  });
  it('싸바리지가 너무 작으면 음수 몸통 → 검증에서 거부', () => {
    const p = paramsFromWrap({ lidWrapW: 20, lidWrapD: 15, lidWingDepth: 38, baseWingDepth: 43, board: 2, lidClearance: 0.5, wrapMargin: 2.4, tuck: 19.3, bleed: 3 });
    expect(validateParams(p).length).toBeGreaterThan(0);
  });
});

describe('저장값 읽기', () => {
  it('없거나 잘못된 값은 기본값', () => {
    expect(paramsFromUnknown(undefined)).toEqual(DEFAULT_PARAMS);
    expect(paramsFromUnknown({ baseH: 60, baseW: 'x' })).toEqual({ ...DEFAULT_PARAMS, baseH: 60 });
  });
});

describe('비율 변경 판단', () => {
  const ref = (p: BoxParams) => Object.fromEntries(Object.entries(faceSizes(p)).map(([k, v]) => [k, v[0] / v[1]]));
  const all = () => true;
  it('임계값은 ±5% 상수 한 곳', () => expect(RATIO_ALERT_THRESHOLD).toBe(0.05));
  it('높이 43→60: 하단 앞·뒤·좌·우 면 비율이 크게 변한다, 뚜껑 상단·바닥은 아니다', () => {
    const ch = ratioChanges(ref(DEFAULT_PARAMS), faceSizes(P({ baseH: 60 })), all);
    const ids = ch.map((c) => c.id).sort();
    expect(ids).toEqual(['base_back', 'base_front', 'base_left', 'base_right']);
    const f = ch.find((c) => c.id === 'base_front')!;
    expect(formatRatio(f.from)).toBe('3.72:1'); expect(formatRatio(f.to)).toBe('2.67:1'); expect(formatPct(f.pct)).toBe('−28%');
  });
  it('이미지 없는 면은 알리지 않는다', () => {
    const ch = ratioChanges(ref(DEFAULT_PARAMS), faceSizes(P({ baseH: 60 })), (id) => id === 'base_front');
    expect(ch.map((c) => c.id)).toEqual(['base_front']);
  });
  it('임계값 미만의 작은 변경은 알리지 않는다 (+4% 미만)', () => {
    const ch = ratioChanges(ref(DEFAULT_PARAMS), faceSizes(P({ baseW: 162 })), all); // 가로 +2mm: 뚜껑 상단 비율 +1.2%
    expect(ch).toEqual([]);
  });
  it('경계: 정확히 5% 는 알린다, 4.9% 는 아니다', () => {
    const base = { lid_top: 1.0 } as any; const sizes = (r: number) => ({ lid_top: [r, 1] } as any);
    expect(ratioChanges(base, sizes(1.05), all).length).toBe(1);
    expect(ratioChanges(base, sizes(1.049), all).length).toBe(0);
  });
  it('원래대로 돌아오면 변경 없음', () => expect(ratioChanges(ref(DEFAULT_PARAMS), faceSizes(DEFAULT_PARAMS), all)).toEqual([]));
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARTBOARD_PRESETS, PRESET_SABARI_160_110_43 as P, artboardMismatch, artboardRegions, presetBoxMatches } from '../src/dieline';

const near = (a: number, b: number, e = 0.011) => Math.abs(a - b) <= e;
// 인쇄소 칼선(.ai)에서 tools/dieline_extract.py 로 뽑은 선분 묶음(개발 중 추출한 참고 데이터). 파일이 없으면(다른 PC) 이 검사는 건너뛴다.
const aiPath = path.resolve(__dirname, '../../verification/dieline-real/ai_components.json');
const ai = fs.existsSync(aiPath) ? (JSON.parse(fs.readFileSync(aiPath, 'utf8')) as { artboardMm: [number, number]; components: { x0: number; y0: number; x1: number; y1: number; w: number; h: number }[] }) : null;

describe('인쇄소 칼선 프리셋', () => {
  it('프리셋은 하나이고 재단 여분 0, 아트보드 525.7×349.0', () => {
    expect(ARTBOARD_PRESETS).toHaveLength(1);
    expect(P.bleedMm).toBe(0);
    expect(P.artboardMm).toEqual([525.7, 349.0]);
  });
  it('면 영역은 접이선까지의 패널·날개이며 서로 겹치지 않고 접하는 곳은 접이선이다', () => {
    const r = P.regionsMm.lid;
    expect(r.lid_back.x + r.lid_back.w).toBeCloseTo(r.lid_top.x, 6); // 왼쪽 날개 오른쪽 끝 = 패널 왼쪽
    expect(r.lid_top.x + r.lid_top.w).toBeCloseTo(r.lid_front.x, 6);
    expect(r.lid_right.y + r.lid_right.h).toBeCloseTo(r.lid_top.y, 6);
    expect(r.lid_top.y + r.lid_top.h).toBeCloseTo(r.lid_left.y, 6);
    const b = P.regionsMm.base;
    expect(b.base_front.x + b.base_front.w).toBeCloseTo(b.base_bottom.x, 6);
    expect(b.base_bottom.y + b.base_bottom.h).toBeCloseTo(b.base_left.y, 6);
  });
  it.skipIf(!ai)('프리셋 좌표가 .ai 에서 다시 뽑은 값과 같다(±0.01mm)', () => {
    const c = ai!.components;
    expect(near(ai!.artboardMm[0], 525.72, 0.02) && near(ai!.artboardMm[1], 349.05, 0.06)).toBe(true);
    const panel = (w: number, h: number) => c.find((q) => near(q.w, w) && near(q.h, h) && q.w > 0 && q.h > 0)!;
    const lid = panel(117.4, 167.4), base = panel(112.4, 162.4);
    expect(near(lid.x0, P.regionsMm.lid.lid_top.x) && near(lid.y0, P.regionsMm.lid.lid_top.y)).toBe(true);
    expect(near(base.x0, P.regionsMm.base.base_bottom.x) && near(base.y0, P.regionsMm.base.base_bottom.y)).toBe(true);
    // 접이선: 왼쪽 날개 안쪽 끝 x=39.04, 오른쪽 232.44, 위 y=53.84, 아래 297.24 (세로·가로 선 하나짜리 묶음)
    const vline = (x: number, h: number) => c.some((q) => near(q.x0, x) && near(q.w, 0, 0.001) && near(q.h, h));
    const hline = (y: number, w: number) => c.some((q) => near(q.y0, y) && near(q.h, 0, 0.001) && near(q.w, w));
    expect(vline(P.regionsMm.lid.lid_back.x, 167.4)).toBe(true);
    expect(vline(P.regionsMm.lid.lid_front.x + 38, 167.4)).toBe(true);
    expect(hline(P.regionsMm.lid.lid_right.y, 117.4)).toBe(true);
    expect(hline(P.regionsMm.lid.lid_left.y + 38, 117.4)).toBe(true);
    // 몸통 날개 깊이 43
    expect(vline(P.regionsMm.base.base_front.x, 162.4)).toBe(true);
    expect(hline(P.regionsMm.base.base_right.y, 112.4)).toBe(true);
  });
  it('이미지 픽셀 ↔ 아트보드 mm 대응', () => {
    const w = 6209, h = 4122, r = artboardRegions(P, 'lid', w, h, 525.7, 349.0);
    expect(r.lid_top.x).toBeCloseTo(77.04 * (w / 525.7), 6);
    expect(r.lid_top.w).toBeCloseTo(117.4 * (w / 525.7), 6);
    expect(r.lid_top.h).toBeCloseTo(167.4 * (h / 349.0), 6);
    expect(Object.keys(r).sort()).toEqual(['lid_back', 'lid_front', 'lid_left', 'lid_right', 'lid_top']);
    expect(Object.keys(artboardRegions(P, 'base', w, h, 525.7, 349.0)).sort()).toEqual(['base_back', 'base_bottom', 'base_front', 'base_left', 'base_right']);
  });
  it('이미지 비율이 아트보드와 1% 이상 다르면 어긋남으로 본다', () => {
    expect(artboardMismatch(6209, 4122, 525.7, 349.0)).toBeLessThan(0.001); // 실제 파일 크기
    expect(artboardMismatch(6209, 4122, 525.7, 349.0)).toBeLessThanOrEqual(0.01);
    expect(artboardMismatch(6209, 4000, 525.7, 349.0)).toBeGreaterThan(0.01);
    expect(artboardMismatch(525.7 * 10, 349.0 * 10 * 1.011, 525.7, 349.0)).toBeGreaterThan(0.01);
  });
  it('현재 박스 치수가 프리셋과 같은지', () => {
    expect(presetBoxMatches(P, { baseW: 160, baseD: 110, baseH: 43, lidH: 38 })).toBe(true);
    expect(presetBoxMatches(P, { baseW: 160, baseD: 110, baseH: 60, lidH: 38 })).toBe(false);
  });
});

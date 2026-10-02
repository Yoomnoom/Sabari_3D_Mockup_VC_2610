import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, BoxParams, faceSizes } from '../src/params';
import { buildDieline, dielineSvg, regionsFor, aspectMismatch, SVG_DISCLAIMER } from '../src/dieline';

const OUT = new URL('../../verification/', import.meta.url);
const P = (o: Partial<BoxParams> = {}): BoxParams => ({ ...DEFAULT_PARAMS, ...o });

describe('칼선 레이아웃(면 배치 목록)', () => {
  const lid = buildDieline(DEFAULT_PARAMS, 'lid');
  const base = buildDieline(DEFAULT_PARAMS, 'base');

  it('기본값 뚜껑: 패널 117.4×167.4, 날개 깊이 38, 외곽 232.0×282.0', () => {
    expect([lid.panel.w, lid.panel.h]).toEqual([117.4, 167.4]);
    expect(lid.depth).toBe(38);
    expect(lid.width).toBeCloseTo(232.0, 6); expect(lid.height).toBeCloseTo(282.0, 6);
  });
  it('기본값 몸통: 패널 112.4×162.4, 날개 깊이 43', () => {
    expect([base.panel.w, base.panel.h]).toEqual([112.4, 162.4]);
    expect(base.depth).toBe(43);
    expect(base.width).toBeCloseTo(112.4 + 2 * 62.3, 6); expect(base.height).toBeCloseTo(162.4 + 2 * 62.3, 6);
  });
  it('각 면 영역의 크기 = 면 크기(mm), 회전하면 가로·세로가 바뀐다', () => {
    const sizes = faceSizes(DEFAULT_PARAMS);
    for (const d of [lid, base]) for (const f of d.faces) {
      const [w, h] = sizes[f.id];
      expect([f.faceW, f.faceH]).toEqual([w, h]);
      const swap = f.rotationDeg === 90 || f.rotationDeg === 270;
      expect([f.rect.w, f.rect.h]).toEqual(swap ? [h, w] : [w, h]);
    }
  });
  it('면 5개가 서로 겹치지 않고 외곽 안에 있다', () => {
    for (const d of [lid, base]) {
      expect(d.faces.map((f) => f.side).sort()).toEqual(['bottom', 'left', 'panel', 'right', 'top']);
      for (const f of d.faces) {
        expect(f.rect.x).toBeGreaterThanOrEqual(-1e-9); expect(f.rect.y).toBeGreaterThanOrEqual(-1e-9);
        expect(f.rect.x + f.rect.w).toBeLessThanOrEqual(d.width + 1e-9); expect(f.rect.y + f.rect.h).toBeLessThanOrEqual(d.height + 1e-9);
      }
      for (let i = 0; i < d.faces.length; i++) for (let j = i + 1; j < d.faces.length; j++) {
        const A = d.faces[i].rect, B = d.faces[j].rect;
        const overlap = A.x < B.x + B.w - 1e-9 && B.x < A.x + A.w - 1e-9 && A.y < B.y + B.h - 1e-9 && B.y < A.y + A.h - 1e-9;
        expect(overlap).toBe(false);
      }
    }
  });
  it('뚜껑: 뒷날개=왼쪽, 앞날개=오른쪽, 왼쪽 날개=아래, 오른쪽 날개=위 / 회전 값', () => {
    const by = (id: string) => lid.faces.find((f) => f.id === id)!;
    expect([by('lid_back').side, by('lid_front').side, by('lid_left').side, by('lid_right').side]).toEqual(['left', 'right', 'bottom', 'top']);
    expect([by('lid_top').rotationDeg, by('lid_back').rotationDeg, by('lid_front').rotationDeg, by('lid_left').rotationDeg, by('lid_right').rotationDeg]).toEqual([270, 90, 270, 0, 180]);
  });
  it('치수를 바꾸면 레이아웃이 따라 바뀐다', () => {
    const q = P({ baseW: 200, baseD: 130, lidH: 50, tuck: 20 });
    const d = buildDieline(q, 'lid');
    // 뚜껑 외경 = 몸통 + 2×(합지 2 + 여유 0.5) → 205×135, 싸바리지 여유 2.4 를 더한 패널
    expect(d.panel.w).toBeCloseTo(135 + 2.4, 6);
    expect(d.panel.h).toBeCloseTo(205 + 2.4, 6);
    expect(d.depth).toBe(50);
    expect(d.width).toBeCloseTo(d.panel.w + 2 * (50 + 20), 6);
    expect(d.height).toBeCloseTo(d.panel.h + 2 * (50 + 20), 6);
    // 면 영역은 새 면 크기와 같다
    const sizes = faceSizes(q);
    for (const f of d.faces) expect([f.faceW, f.faceH]).toEqual(sizes[f.id]);
  });
  it('이미지에서 면 영역(px)을 계산한다: 여분 3mm, 이미지 크기에 비례', () => {
    const imgW = Math.round((lid.width + 6) * 10), imgH = Math.round((lid.height + 6) * 10); // 10px/mm
    const r = regionsFor(lid, imgW, imgH, 3);
    const top = r['lid_top'];
    expect(top.x).toBeCloseTo((lid.faces[0].rect.x + 3) * 10, 0);
    expect(top.w).toBeCloseTo(115 * 10, 0); expect(top.h).toBeCloseTo(165 * 10, 0);
    expect(aspectMismatch(lid, imgW, imgH, 3)).toBeLessThan(0.002);
    expect(aspectMismatch(lid, imgW, Math.round(imgH * 1.2), 3)).toBeGreaterThan(0.1);
  });
});

describe('칼선 SVG', () => {
  const lid = buildDieline(DEFAULT_PARAMS, 'lid');
  const svg = dielineSvg(lid, 3);
  it('1:1 실제 크기(mm): width/height 는 mm, viewBox 1단위 = 1mm', () => {
    expect(svg).toContain(`width="${lid.width + 6}mm"`); expect(svg).toContain(`height="${lid.height + 6}mm"`);
    expect(svg).toContain(`viewBox="-3 -3 ${lid.width + 6} ${lid.height + 6}"`);
  });
  it('재단선·접는선·안내선이 서로 다른 레이어이고 색·선 종류가 다르다', () => {
    for (const id of ['재단선', '접는선', '안내선']) expect(svg).toContain(`id="${id}"`);
    expect(svg).toContain('stroke="#e60000"'); expect(svg).toContain('stroke="#0066ff"'); expect(svg).toContain('stroke="#00a050"');
    expect(svg).toMatch(/stroke="#0066ff"[^>]*stroke-dasharray="4 2"/);
    expect(svg).toMatch(/stroke="#00a050"[^>]*stroke-dasharray="1 1.5"/);
    const cut = svg.slice(svg.indexOf('id="재단선"'), svg.indexOf('id="접는선"'));
    expect(cut).not.toContain('stroke-dasharray'); // 재단선은 실선
  });
  it('"제조 칼선 아님" 문구가 파일에 있다', () => {
    expect(svg).toContain(SVG_DISCLAIMER);
    expect(svg).toContain('제조 칼선 아님');
    expect(svg.match(/제조 칼선 아님/g)!.length).toBeGreaterThanOrEqual(2); // 주석·desc·본문
  });
  it('검증용 파일과 레이아웃 요약을 verification/ 에 쓴다', () => {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(new URL('dieline_default_lid.svg', OUT), dielineSvg(lid, 3, (id) => id));
    writeFileSync(new URL('dieline_default_base.svg', OUT), dielineSvg(buildDieline(DEFAULT_PARAMS, 'base'), 3, (id) => id));
    const summary = (d: ReturnType<typeof buildDieline>) => ({ kind: d.kind, panel: { w: d.panel.w, h: d.panel.h }, depth: d.depth, tuck: d.tuck, cutWidth: d.width, cutHeight: d.height });
    writeFileSync(new URL('dieline_default_layout.json', OUT), JSON.stringify({ lid: summary(lid), base: summary(buildDieline(DEFAULT_PARAMS, 'base')) }, null, 2));
  });
});

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, BoxParams, derive, faceSizes } from '../src/params';
import { buildParts, BASE_FACES, LID_FACES } from '../src/templateMesh';
import { buildTemplateGlb, readGlbBin, readGlbJson } from '../src/templateGlb';

const PY_GLB = new URL('../../assets/templates/sabari_160x110x43_v2.glb', import.meta.url);
const OUT = new URL('../../verification/', import.meta.url);
const withParams = (o: Partial<BoxParams>): BoxParams => ({ ...DEFAULT_PARAMS, ...o });

describe('TypeScript 템플릿 = Python 템플릿 (기본값)', () => {
  const py = new Uint8Array(readFileSync(PY_GLB));
  const ts = buildTemplateGlb({ ...DEFAULT_PARAMS });
  const jp = readGlbJson(py), jt = readGlbJson(ts);

  it('노드·메시·재질 이름과 계층이 같다', () => {
    expect(jt.nodes).toEqual(jp.nodes);
    expect(jt.meshes).toEqual(jp.meshes);
    expect(jt.materials).toEqual(jp.materials);
    expect(jt.scenes).toEqual(jp.scenes);
  });
  it('버퍼 구조(뷰·접근자 min/max 포함)가 같다', () => {
    expect(jt.bufferViews).toEqual(jp.bufferViews);
    expect(jt.accessors).toEqual(jp.accessors);
    expect(jt.buffers).toEqual(jp.buffers);
  });
  it('정점·법선·UV·인덱스 바이너리가 바이트 단위로 같다', () => {
    const a = readGlbBin(py), b = readGlbBin(ts);
    expect(b.length).toBe(a.length);
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0);
  });
  it('extras 는 params 만 더 가진다', () => {
    const { params, ...rest } = jt.extras;
    expect(params).toEqual(DEFAULT_PARAMS);
    expect(rest).toEqual(jp.extras);
  });
});

describe('치수를 바꿔도 구조·규칙이 유지된다', () => {
  const cases: [string, Partial<BoxParams>][] = [
    ['기본', {}], ['높이 60', { baseH: 60 }], ['큰 박스', { baseW: 250, baseD: 180, baseH: 80, lidH: 55 }],
    ['얇은 합지', { board: 1, lidClearance: 1 }], ['정사각', { baseW: 120, baseD: 120 }],
  ];
  for (const [name, o] of cases) {
    const p = withParams(o);
    it(`${name}: 부품 이름·편집면 UV·단색 부품`, () => {
      const parts = buildParts(p);
      expect(parts.map((x) => x.name)).toEqual([...LID_FACES, 'lid_rim', 'lid_inner', ...BASE_FACES, 'base_rim', 'base_inner']);
      for (const part of parts) {
        if (part.editable) {
          expect(new Set(part.uv.map((v) => +v.toFixed(6))).size).toBe(2); // 0 과 1 두 값뿐
          expect(Math.min(...part.uv)).toBeCloseTo(0, 6); expect(Math.max(...part.uv)).toBeCloseTo(1, 6);
        } else expect(part.uv).toEqual([]);
        // 삼각형 방향 = 법선
        for (let t = 0; t < part.idx.length; t += 3) {
          const P = (k: number) => part.pos.slice(part.idx[t + k] * 3, part.idx[t + k] * 3 + 3);
          const [a, b, c] = [P(0), P(1), P(2)];
          const e1 = b.map((v, i) => v - a[i]), e2 = c.map((v, i) => v - a[i]);
          const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
          const ns = part.nrm.slice(part.idx[t] * 3, part.idx[t] * 3 + 3);
          expect(n[0] * ns[0] + n[1] * ns[1] + n[2] * ns[2]).toBeGreaterThan(0);
        }
      }
    });
    it(`${name}: 면 메시의 실제 크기(mm) = faceSizes`, () => {
      const sizes = faceSizes(p);
      for (const part of buildParts(p).filter((x) => x.editable)) {
        const xs = part.pos.filter((_, i) => i % 3 === 0), ys = part.pos.filter((_, i) => i % 3 === 1), zs = part.pos.filter((_, i) => i % 3 === 2);
        const ext = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), Math.max(...zs) - Math.min(...zs)].map((v) => v * 1000);
        const [w, h] = sizes[part.name as keyof typeof sizes];
        const flat = ext.filter((v) => v > 1e-6).sort((a, b) => a - b); // 두 변
        expect(flat.length).toBe(2);
        expect(flat[0]).toBeCloseTo(Math.min(w, h), 4); expect(flat[1]).toBeCloseTo(Math.max(w, h), 4);
      }
    });
    it(`${name}: 닫힌 전체 바운딩박스 = 뚜껑 외경 × (몸통 높이 + 합지 두께)`, () => {
      const d = derive(p);
      const all = buildParts(p).flatMap((x) => x.pos);
      const ext = [0, 1, 2].map((k) => { const v = all.filter((_, i) => i % 3 === k); return (Math.max(...v) - Math.min(...v)) * 1000; });
      expect(ext[0]).toBeCloseTo(d.lidW, 4); expect(ext[2]).toBeCloseTo(d.lidD, 4); expect(ext[1]).toBeCloseTo(d.closedH, 4);
      const baseOnly = buildParts(p).filter((x) => x.group === 'base').flatMap((x) => x.pos);
      const be = [0, 1, 2].map((k) => { const v = baseOnly.filter((_, i) => i % 3 === k); return (Math.max(...v) - Math.min(...v)) * 1000; });
      expect(be[0]).toBeCloseTo(p.baseW, 4); expect(be[1]).toBeCloseTo(p.baseH, 4); expect(be[2]).toBeCloseTo(p.baseD, 4);
    });
  }
  it('gltf-validator 검증용 GLB 를 verification/ 에 쓴다', () => {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(new URL('ts_template_default.glb', OUT), buildTemplateGlb({ ...DEFAULT_PARAMS }));
    writeFileSync(new URL('ts_template_h60.glb', OUT), buildTemplateGlb(withParams({ baseH: 60 })));
    writeFileSync(new URL('ts_template_big.glb', OUT), buildTemplateGlb(withParams({ baseW: 250, baseD: 180, baseH: 80, lidH: 55 })));
  });
});

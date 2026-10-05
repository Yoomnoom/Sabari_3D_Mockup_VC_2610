import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SHADE, GLSL_OUT, LIGHT_SUM_LINE, applyFlatShading, createShadeState, shadeFactor } from '../src/shading';

describe('음영 계수', () => {
  it('정면(cos=1)은 항상 1.0 — 입력 색 그대로', () => {
    for (const s of [0, 0.3, 1]) expect(shadeFactor(1, s)).toBe(1);
  });
  it('세기 0이면 모든 각도에서 1.0(평면 색)', () => {
    for (let d = 0; d <= 90; d += 5) expect(shadeFactor(Math.cos((d * Math.PI) / 180), 0)).toBe(1);
  });
  it('1.0을 넘지 않고, 각도가 클수록 단조 감소(어두워짐)', () => {
    for (const s of [0.1, DEFAULT_SHADE, 0.7, 1]) {
      let prev = 1.0000001;
      for (let d = 0; d <= 90; d += 1) {
        const f = shadeFactor(Math.cos((d * Math.PI) / 180), s);
        expect(f).toBeLessThanOrEqual(1); expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThanOrEqual(prev + 1e-12); prev = f;
      }
    }
  });
  it('뒷면(cos<0)과 범위 밖 입력도 0~1 안', () => {
    expect(shadeFactor(-0.5, 0.3)).toBeCloseTo(0.7, 12);
    expect(shadeFactor(5, 0.3)).toBe(1);
    expect(shadeFactor(0.5, 2)).toBeCloseTo(0.5, 12); // 세기는 1로 제한
  });
  it('기본 세기는 예전 화면의 30°·60°·80° 밝기 비(0.96·0.84·0.71)에 가깝다', () => {
    const f = (d: number) => shadeFactor(Math.cos((d * Math.PI) / 180), DEFAULT_SHADE);
    expect(Math.abs(f(30) - 0.96)).toBeLessThan(0.03); expect(Math.abs(f(60) - 0.84)).toBeLessThan(0.03); expect(Math.abs(f(80) - 0.71)).toBeLessThan(0.06);
  });
});

describe('셰이더 패치', () => {
  const frag = THREE.ShaderLib.standard.fragmentShader;
  it('three 의 meshphysical 프래그먼트 셰이더에 바꿀 줄과 main 이 있다(three 업데이트 시 감지)', () => {
    expect(frag).toContain(LIGHT_SUM_LINE);
    expect(frag).toContain('void main() {');
  });
  it('패치된 셰이더가 조명 합산 대신 색×음영 계수를 출력하고, 유니폼은 공유 객체다', () => {
    const state = createShadeState(0.5);
    const mat = new THREE.MeshStandardMaterial();
    applyFlatShading(mat, state);
    const shader = { uniforms: {} as Record<string, { value: unknown }>, fragmentShader: frag } as unknown as THREE.WebGLProgramParametersWithUniforms;
    mat.onBeforeCompile(shader, null as unknown as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain(GLSL_OUT);
    expect(shader.fragmentShader).not.toContain(LIGHT_SUM_LINE);
    expect(shader.fragmentShader).toContain('float sabariShade(');
    expect(shader.uniforms.uShadeStrength).toBe(state.strength);
    expect(shader.uniforms.uShadeDir).toBe(state.lightDir);
  });
  it('MeshStandard 가 아닌 재질은 건드리지 않는다', () => {
    const mat = new THREE.MeshBasicMaterial(); const before = mat.onBeforeCompile;
    applyFlatShading(mat, createShadeState());
    expect(mat.onBeforeCompile).toBe(before);
  });
});

// 뷰어 음영: "조명은 조명이고 컬러는 컬러" — 넣은 색은 카메라를 마주 보는 면에서 그대로 보이고, 음영은 색을 어둡게만 한다(밝히지 않는다).
// 예전에는 반구광+방향광+MeshStandardMaterial 반사광(F0 0.04)이 색에 일정한 가산 성분(약 sRGB 27)과 약 13% 이득을 더해
// 어두운 색이 28 아래로 내려가지 못했다. 이제 조명 계산 결과를 버리고 "텍스처·색 × 음영 계수"만 출력한다.
// GLB 내보내기는 재질 속성(baseColor·텍스처)만 읽으므로 이 셰이더 패치의 영향을 받지 않는다.
import * as THREE from 'three';

/** 기본 음영 세기. 예전 화면에서 정면 대비 30°·60°·80° 기울어진 면의 밝기 비(0.96·0.84·0.71)에 가장 가까운 값(0.96·0.85·0.75). */
export const DEFAULT_SHADE = 0.3;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * 음영 계수(0~1). cosToLight = 면 법선·빛 방향(둘 다 뷰 공간 단위벡터). 빛을 정면(카메라 축)에 두면 면이 시선과 이루는 각도가 클수록 어두워진다.
 * 정면 = 1.0(색 그대로), strength 0 = 항상 1.0(평면 색). 1.0 을 넘지 않는다. (셰이더의 shadeFactor 와 같은 식 — 단위 테스트가 둘의 동일성을 지킨다)
 */
export function shadeFactor(cosToLight: number, strength: number): number {
  return 1 - clamp01(strength) * (1 - clamp01(cosToLight));
}

/** 모든 재질이 같은 유니폼 객체를 공유해 슬라이더 하나로 한꺼번에 바뀐다. lightDir 는 뷰 공간(기본 = 카메라 쪽 +Z). */
export interface ShadeState {
  strength: { value: number };
  lightDir: { value: THREE.Vector3 };
}
export const createShadeState = (strength = DEFAULT_SHADE): ShadeState => ({
  strength: { value: clamp01(strength) },
  lightDir: { value: new THREE.Vector3(0, 0, 1) },
});

/** three 의 meshphysical 프래그먼트 셰이더에서 조명 합산 줄. 없으면(three 버전 변경) 테스트가 실패한다. */
export const LIGHT_SUM_LINE = 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;';
const GLSL_DECL = `uniform float uShadeStrength;
uniform vec3 uShadeDir;
float sabariShade( vec3 n, vec3 l, float s ) { return 1.0 - clamp( s, 0.0, 1.0 ) * ( 1.0 - clamp( dot( normalize( n ), l ), 0.0, 1.0 ) ); }
`;
export const GLSL_OUT = 'vec3 outgoingLight = diffuseColor.rgb * sabariShade( normal, uShadeDir, uShadeStrength ) + totalEmissiveRadiance;';

/** MeshStandardMaterial(·Physical)의 출력 색을 "diffuseColor(색·텍스처) × 음영 계수 + 발광"으로 바꾼다. 다른 재질(비조명 등)은 이미 조명이 없어 그대로 둔다. */
export function applyFlatShading(mat: THREE.Material, state: ShadeState): void {
  if (!(mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uShadeStrength = state.strength;
    shader.uniforms.uShadeDir = state.lightDir;
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', GLSL_DECL + 'void main() {').replace(LIGHT_SUM_LINE, GLSL_OUT);
  };
  mat.customProgramCacheKey = () => 'sabari-flat-shade-v1';
  mat.needsUpdate = true;
}

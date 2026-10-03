// 박스 자세(회전) 계산. three 의 수학 클래스만 쓰며 DOM 에 의존하지 않아 단위 테스트가 가능하다.
// 내부 저장은 쿼터니언이다. 숫자(오일러) 입력·표시 UI 는 단계 23 에서 없앴으므로 오일러 변환도 두지 않는다.
import * as THREE from 'three';

/** 각도 스냅 단위(도). Ctrl(Cmd)을 누르고 고리를 끌 때 이 단위로 맞춘다 — 조정은 이 상수 한 곳. */
export const SNAP_DEG = 15;

export type Axis = 'x' | 'y' | 'z';

export const AXIS_VEC: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};
export const AXIS_LABEL: Record<Axis, string> = { x: 'X', y: 'Y', z: 'Z' };
export const AXIS_COLOR: Record<Axis, number> = { x: 0xe03131, y: 0x2f9e44, z: 0x1c7ed6 };

export const snap = (deg: number, step = SNAP_DEG) => Math.round(deg / step) * step;

/** 월드 축 둘레로 deg 만큼 돌린 자세(앞에서 곱함). */
export function rotateAbout(q0: THREE.Quaternion, axis: Axis, deg: number): THREE.Quaternion {
  const d = new THREE.Quaternion().setFromAxisAngle(AXIS_VEC[axis], THREE.MathUtils.degToRad(deg));
  return d.multiply(q0).normalize();
}

/** 평면 위에서 시작 벡터 v0 에서 v 까지의 축 둘레 부호 있는 각(도). 오른손 법칙(+). */
export function signedAngleDeg(axis: THREE.Vector3, v0: THREE.Vector3, v: THREE.Vector3): number {
  return THREE.MathUtils.radToDeg(Math.atan2(axis.dot(new THREE.Vector3().crossVectors(v0, v)), v0.dot(v)));
}

/** 두 자세가 같은 방향인지(쿼터니언 q 와 −q 는 같은 자세). */
export const sameRotation = (a: THREE.Quaternion, b: THREE.Quaternion, eps = 1e-6) => Math.abs(a.dot(b)) > 1 - eps;

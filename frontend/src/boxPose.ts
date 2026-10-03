// 박스 자세(회전) 계산. three 의 수학 클래스만 쓰며 DOM 에 의존하지 않아 단위 테스트가 가능하다.
// 내부 저장은 쿼터니언이고, 화면에 보이는 오일러 각은 Unity 와 같은 순서(Z → X → Y 순으로 적용 = three 의 'YXZ')로 표시한다.
// 좌표계는 three.js 오른손 좌표(Y-up)이며 Unity(왼손)와 부호가 다를 수 있다. 순서만 같다.
import * as THREE from 'three';

/** 각도 스냅 단위(도). Ctrl(Cmd)을 누르고 고리를 끌 때 이 단위로 맞춘다 — 조정은 이 상수 한 곳. */
export const SNAP_DEG = 15;
/** 표시 오일러 X 가 ±90° 에 가까우면 짐벌 락으로 Y·Z 숫자가 튀므로 안내한다(도). */
export const GIMBAL_WARN_DEG = 85;
export const EULER_ORDER = 'YXZ' as const;

export type Axis = 'x' | 'y' | 'z';
export type Space = 'world' | 'local';

export const AXIS_VEC: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};
export const AXIS_LABEL: Record<Axis, string> = { x: 'X', y: 'Y', z: 'Z' };
export const AXIS_COLOR: Record<Axis, number> = { x: 0xe03131, y: 0x2f9e44, z: 0x1c7ed6 };

export const snap = (deg: number, step = SNAP_DEG) => Math.round(deg / step) * step;

/** 축 둘레로 deg 만큼 돌린 자세. world: 월드 축 기준(앞에서 곱함), local: 박스 축 기준(뒤에서 곱함). */
export function rotateAbout(q0: THREE.Quaternion, axis: Axis, deg: number, space: Space): THREE.Quaternion {
  const d = new THREE.Quaternion().setFromAxisAngle(AXIS_VEC[axis], THREE.MathUtils.degToRad(deg));
  const q = space === 'world' ? d.multiply(q0) : q0.clone().multiply(d);
  return q.normalize();
}

/** 박스 축(local)의 월드 방향 벡터 */
export function axisInWorld(q: THREE.Quaternion, axis: Axis, space: Space): THREE.Vector3 {
  const v = AXIS_VEC[axis].clone();
  return space === 'local' ? v.applyQuaternion(q) : v;
}

export function toEulerDeg(q: THREE.Quaternion): { x: number; y: number; z: number } {
  const e = new THREE.Euler().setFromQuaternion(q, EULER_ORDER);
  const r = (n: number) => { const v = THREE.MathUtils.radToDeg(n); const t = Math.round(v * 100) / 100; return Object.is(t, -0) ? 0 : t; };
  return { x: r(e.x), y: r(e.y), z: r(e.z) };
}

export function fromEulerDeg(x: number, y: number, z: number): THREE.Quaternion {
  const d = THREE.MathUtils.degToRad;
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(d(x), d(y), d(z), EULER_ORDER)).normalize();
}

export const nearGimbal = (q: THREE.Quaternion) => Math.abs(toEulerDeg(q).x) >= GIMBAL_WARN_DEG;

/** 평면 위에서 시작 벡터 v0 에서 v 까지의 축 둘레 부호 있는 각(도). 오른손 법칙(+). */
export function signedAngleDeg(axis: THREE.Vector3, v0: THREE.Vector3, v: THREE.Vector3): number {
  return THREE.MathUtils.radToDeg(Math.atan2(axis.dot(new THREE.Vector3().crossVectors(v0, v)), v0.dot(v)));
}

/** 두 자세가 같은 방향인지(쿼터니언 q 와 −q 는 같은 자세). */
export const sameRotation = (a: THREE.Quaternion, b: THREE.Quaternion, eps = 1e-6) => Math.abs(a.dot(b)) > 1 - eps;

// 시점 버튼 방향 상수와, 그것에서 도출하는 회전축 버튼의 축(박스 국소 좌표). three 의 수학 클래스만 쓰며 DOM 에 의존하지 않아 단위 테스트가 가능하다.
import * as THREE from 'three';

export type ViewName = 'front' | 'back' | 'left' | 'right' | 'top' | 'iso' | 'isoL' | 'bottom';

export const DIRS: Record<ViewName, [number, number, number]> = {
  front: [0, 0.12, 1], back: [0, 0.12, -1], left: [-1, 0.12, 0], right: [1, 0.12, 0],
  top: [0, 1, 0.0001], iso: [0.9, 0.75, 1.05], isoL: [-0.9, 0.75, -1.05], bottom: [0, -1, 0.0001], // bottom: 아래에서 올려다봄(화면 위쪽 = 앞) // R = 앞·오른쪽 날개가 보이는 모서리, L = 그 반대 모서리(뒤·왼쪽 날개)
};

/** 회전축 버튼(시점 버튼과 같은 이름). 3/4 는 시점 버튼의 'iso' 방향이다. */
export const AXIS_VIEW_NAMES: ViewName[] = ['front', 'back', 'left', 'right', 'top', 'bottom', 'iso'];

/**
 * 시점 이름 → 그 시점이 박스 중심을 바라보는 선(박스 국소 좌표의 단위 벡터). 시점 버튼이 쓰는 DIRS 방향 상수를 그대로 쓴다.
 * 정면·후면·좌측·우측·윗면·아래는 시점 방향에서 카메라 고도(0.12 등) 성분을 걷어낸 주축이라 마주 보는 두 시점이 같은 선이 된다(정면/후면 = 앞뒤, 좌측/우측 = 좌우, 윗면/아래 = 위아래).
 * 3/4 는 3/4 시점의 시선 방향(대각선) 그대로다.
 */
export function viewAxisLocal(name: ViewName): THREE.Vector3 {
  const d = new THREE.Vector3(...DIRS[name]).normalize();
  if (name === 'iso' || name === 'isoL') return d;
  const k = (['x', 'y', 'z'] as const).reduce((a, b) => (Math.abs(d[a]) >= Math.abs(d[b]) ? a : b));
  const out = new THREE.Vector3(); out[k] = 1;
  return out;
}


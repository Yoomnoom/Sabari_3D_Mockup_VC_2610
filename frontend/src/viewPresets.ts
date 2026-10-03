// 박스 놓기(눕힘/세움)와 제출 각도 프리셋. 구도 값은 이 파일 한 곳에서만 바꾼다. three 수학 클래스만 쓰며 DOM 에 의존하지 않는다.
import * as THREE from 'three';

export type BoxPose = 'lying' | 'standing';
export type SubmitSide = 'right' | 'left';
export type DragLock = 'free' | 'az' | 'el';

/**
 * 제출 각도(오른쪽) 구도. 큰 면(lid_top)이 정면을 향하고 박스의 긴 변이 세로로 서며, 카메라가 az 만큼 옆으로 돌아 한쪽 긴 날개 면이 좁게 보인다.
 * 방위각 +는 카메라가 오른쪽(+X)으로 간 쪽(= 오른쪽에 옆면이 보임). 왼쪽 프리셋은 부호만 반전해 같은 값을 쓴다.
 * 초기 추정(큰 면 기준 좌우 30°, 위로 10°)을 참고 이미지 비교(verification/submit_compare_*.png)로 확인한 값이다.
 */
export const SUBMIT_ANGLE = { az: 30, el: 10 } as const;
export const submitAngles = (side: SubmitSide) => ({ az: side === 'right' ? SUBMIT_ANGLE.az : -SUBMIT_ANGLE.az, el: SUBMIT_ANGLE.el });

/**
 * 세움 자세: 상단면(lid_top, 법선 +Y)이 정면(+Z)을 향하도록 X 로 +90° 눕힌 뒤,
 * 긴 변이 가로(X)에 있으면 정면 축(Z)으로 +90° 더 돌려 긴 변을 세로로 세운다. sizeX/sizeZ = 박스를 눕혔을 때의 가로·세로 크기.
 */
export function standingQuat(sizeX: number, sizeZ: number): THREE.Quaternion {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  if (sizeX >= sizeZ) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
  return q;
}

/** 현재 자세가 눕힘/세움 중 어느 쪽인지(둘 다 아니면 null = 고리로 직접 돌린 자세). */
export function classifyPose(q: THREE.Quaternion, standing: THREE.Quaternion): BoxPose | null {
  if (Math.abs(q.dot(new THREE.Quaternion())) > 1 - 1e-6) return 'lying';
  if (Math.abs(q.dot(standing)) > 1 - 1e-6) return 'standing';
  return null;
}

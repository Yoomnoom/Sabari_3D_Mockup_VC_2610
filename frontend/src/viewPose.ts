import * as THREE from 'three';

export type BoxPose = 'lying' | 'standing';
export type AxisLock = 'free' | 'horizontal' | 'vertical';

const STANDING = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 1, 0), // 긴 변(+X) → 화면 세로(+Y)
    new THREE.Vector3(0, 0, 1), // lid_top 법선(+Y) → 사용자(+Z)
    new THREE.Vector3(1, 0, 0),
  ),
);

/** 화면 전용 박스 자세. 호출자가 바꾸지 못하도록 매번 복제한다. */
export const boxPoseQuaternion = (pose: BoxPose): THREE.Quaternion =>
  pose === 'standing' ? STANDING.clone() : new THREE.Quaternion();


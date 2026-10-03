import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SNAP_DEG, rotateAbout, sameRotation, signedAngleDeg, snap } from '../src/boxPose';
import { SUBMIT_ANGLE, classifyPose, standingQuat, submitAngles } from '../src/viewPresets';

const I = () => new THREE.Quaternion();
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const r = (a: THREE.Vector3) => a.toArray().map((n) => +n.toFixed(6) + 0);

describe('boxPose', () => {
  it('스냅은 15° 단위', () => {
    expect(SNAP_DEG).toBe(15);
    expect([0, 7, 8, 22, 23, 29, 44, -8, -23, 91].map((d) => snap(d))).toEqual([0, 0, 15, 15, 30, 30, 45, -15, -30, 90]);
  });
  it('월드 축 회전: X +90° 는 +Y 를 +Z 로 보낸다', () => {
    expect(r(v(0, 1, 0).applyQuaternion(rotateAbout(I(), 'x', 90)))).toEqual([0, 0, 1]);
  });
  it('90° 4번 = 원위치', () => {
    for (const axis of ['x', 'y', 'z'] as const) for (const s of [90, -90]) {
      let q = rotateAbout(rotateAbout(I(), 'x', 20), 'y', 35);
      const q0 = q.clone();
      for (let i = 0; i < 4; i++) q = rotateAbout(q, axis, s);
      expect(sameRotation(q, q0, 1e-9)).toBe(true);
    }
  });
  it('평면 각도 부호: +축 오른손 법칙', () => {
    const z = v(0, 0, 1);
    expect(signedAngleDeg(z, v(1, 0, 0), v(0, 1, 0))).toBeCloseTo(90, 6);
    expect(signedAngleDeg(z, v(1, 0, 0), v(0, -1, 0))).toBeCloseTo(-90, 6);
  });
});

describe('viewPresets', () => {
  it('세움: 상단면 법선(+Y)이 정면(+Z)을 향하고 긴 변(가로 X)이 세로(Y)로 선다', () => {
    const q = standingQuat(165, 115);
    expect(r(v(0, 1, 0).applyQuaternion(q))).toEqual([0, 0, 1]); // 큰 면이 정면
    expect(Math.abs(v(1, 0, 0).applyQuaternion(q).y)).toBeCloseTo(1, 6); // 긴 변(X)이 세로
    expect(Math.abs(v(0, 0, 1).applyQuaternion(q).x)).toBeCloseTo(1, 6); // 짧은 변(Z)이 가로
  });
  it('긴 변이 이미 세로(Z)면 X 로만 세운다', () => {
    const q = standingQuat(115, 165);
    expect(r(v(0, 1, 0).applyQuaternion(q))).toEqual([0, 0, 1]);
    expect(Math.abs(v(0, 0, 1).applyQuaternion(q).y)).toBeCloseTo(1, 6);
  });
  it('왼쪽 제출 각도는 오른쪽의 방위각 부호만 반전', () => {
    const a = submitAngles('right'), b = submitAngles('left');
    expect(a).toEqual({ az: SUBMIT_ANGLE.az, el: SUBMIT_ANGLE.el });
    expect(b).toEqual({ az: -a.az, el: a.el });
  });
  it('자세 분류', () => {
    const st = standingQuat(165, 115);
    expect(classifyPose(I(), st)).toBe('lying');
    expect(classifyPose(st.clone(), st)).toBe('standing');
    expect(classifyPose(rotateAbout(st, 'y', 10), st)).toBeNull();
  });
});

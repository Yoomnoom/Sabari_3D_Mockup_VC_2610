import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SNAP_DEG, axisInWorld, fromEulerDeg, nearGimbal, rotateAbout, sameRotation, signedAngleDeg, snap, toEulerDeg } from '../src/boxPose';

const I = () => new THREE.Quaternion();

describe('boxPose', () => {
  it('스냅은 15° 단위', () => {
    expect(SNAP_DEG).toBe(15);
    expect([0, 7, 8, 22, 23, 29, 44, -8, -23, 91].map((d) => snap(d))).toEqual([0, 0, 15, 15, 30, 30, 45, -15, -30, 90]);
  });
  it('월드 축 회전 후 오일러 표시: 한 축만 돌리면 그 축 숫자만 바뀐다', () => {
    expect(toEulerDeg(rotateAbout(I(), 'x', 30, 'world'))).toEqual({ x: 30, y: 0, z: 0 });
    expect(toEulerDeg(rotateAbout(I(), 'y', 40, 'world'))).toEqual({ x: 0, y: 40, z: 0 });
    expect(toEulerDeg(rotateAbout(I(), 'z', -50, 'world'))).toEqual({ x: 0, y: 0, z: -50 });
  });
  it('오일러 왕복 (Unity 순서 Z→X→Y)', () => {
    for (const [x, y, z] of [[10, 20, 30], [-45, 120, 60], [80, -170, 5], [0, 0, 0], [30, 0, 90]]) {
      const q = fromEulerDeg(x, y, z);
      expect(sameRotation(q, fromEulerDeg(...(Object.values(toEulerDeg(q)) as [number, number, number])))).toBe(true);
    }
  });
  it('월드/로컬 축은 박스가 돌아 있으면 달라진다', () => {
    const q = rotateAbout(I(), 'y', 90, 'world'); // 박스를 Y 로 90° 돌림
    const w = axisInWorld(q, 'x', 'world'), l = axisInWorld(q, 'x', 'local');
    expect(w.toArray().map((n) => +n.toFixed(6))).toEqual([1, 0, 0]);
    expect(l.toArray().map((n) => +n.toFixed(6))).toEqual([0, 0, -1]); // 박스의 X 축이 월드 −Z 를 가리킨다
    // 같은 "X 30°" 라도 world 와 local 의 결과 자세가 다르다
    expect(sameRotation(rotateAbout(q, 'x', 30, 'world'), rotateAbout(q, 'x', 30, 'local'))).toBe(false);
  });
  it('90° 4번 = 원위치 (모든 축·양방향, 월드·로컬)', () => {
    for (const axis of ['x', 'y', 'z'] as const) for (const sp of ['world', 'local'] as const) for (const s of [90, -90]) {
      let q = fromEulerDeg(20, 35, -10);
      const q0 = q.clone();
      for (let i = 0; i < 4; i++) q = rotateAbout(q, axis, s, sp);
      expect(sameRotation(q, q0, 1e-9)).toBe(true);
    }
  });
  it('짐벌 근처 판별', () => {
    expect(nearGimbal(fromEulerDeg(88, 0, 0))).toBe(true);
    expect(nearGimbal(fromEulerDeg(30, 0, 0))).toBe(false);
  });
  it('평면 각도 부호: +축 오른손 법칙', () => {
    const z = new THREE.Vector3(0, 0, 1);
    expect(signedAngleDeg(z, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0))).toBeCloseTo(90, 6);
    expect(signedAngleDeg(z, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0))).toBeCloseTo(-90, 6);
  });
});

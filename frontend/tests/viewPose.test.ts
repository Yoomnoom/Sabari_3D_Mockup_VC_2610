import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { boxPoseQuaternion } from '../src/viewPose';

const dir = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyQuaternion(boxPoseQuaternion('standing')).toArray().map((n) => +n.toFixed(6));

describe('standing box pose', () => {
  it('lid_top faces the user and its 165mm edge stands vertically', () => {
    expect(dir(0, 1, 0)).toEqual([0, 0, 1]);
    expect(dir(1, 0, 0)).toEqual([0, 1, 0]);
  });
  it('lying is identity', () => {
    expect(new THREE.Vector3(1, 2, 3).applyQuaternion(boxPoseQuaternion('lying')).toArray()).toEqual([1, 2, 3]);
  });
});

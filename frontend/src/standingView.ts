import type { ViewPresetValue } from './project';

/**
 * 기본 제공 시점 "세운 3/4 · 옆면"(inputs/reference_angle.png 방향). 맞추는 값은 이 한 곳에만 둔다.
 * 박스를 세운다: 상단면(lid_top, 국소 +Y)이 카메라 쪽(+Z)을 보고 긴 변(국소 X)이 화면 세로가 된다.
 * 국소 x→월드 y, y→z, z→x 로 돌리는 순환 치환이라 쿼터니언은 (0.5, 0.5, 0.5, 0.5)이다(축 (1,1,1) 둘레 120°).
 */
export const STANDING_QUAT: [number, number, number, number] = [0.5, 0.5, 0.5, 0.5];

export const STANDING_VIEW = {
  azimuthDeg: 32, // 좌우 시점의 방위각 절댓값(부호만 반대)
  elevationDeg: 0, // 고도(위에서 내려다보는 각)
  fov: 22, // 이 시점에서만 쓰는 시야각(다른 시점·F·눕힘 전환에서는 기본 FOV로 복원)
  distScale: 1, // 맞춤 거리(getFitDistance)에 곱하는 배율
};

export type StandingSide = 'left' | 'right';

/** 저장된 시점과 같은 형식으로 낸다(축 잠금·뚜껑 높이는 지금 상태를 유지하도록 호출하는 쪽에서 채운다). */
export function standingPresetValue(side: StandingSide, base: Pick<ViewPresetValue, 'lock' | 'liftMm'>): ViewPresetValue {
  const az = (side === 'left' ? -1 : 1) * (STANDING_VIEW.azimuthDeg * Math.PI) / 180;
  const el = (STANDING_VIEW.elevationDeg * Math.PI) / 180;
  const s = STANDING_VIEW.distScale;
  return {
    boxQuat: [...STANDING_QUAT],
    camOffset: [Math.sin(az) * Math.cos(el) * s, Math.sin(el) * s, Math.cos(az) * Math.cos(el) * s],
    targetOffset: [0, 0, 0],
    fov: STANDING_VIEW.fov,
    lock: base.lock,
    liftMm: base.liftMm,
  };
}

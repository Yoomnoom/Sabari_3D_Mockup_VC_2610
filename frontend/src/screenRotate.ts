// 화면 기준 박스 회전의 순수 계산(DOM·three 에 의존하지 않아 단위 테스트가 가능하다).
export type RotateAxis = 'horizontal' | 'vertical';

/** Ctrl(Cmd) 스냅 단위(도) — 조정은 이 상수 한 곳. */
export const SNAP_DEG = 15;

/**
 * 드래그 이동량(px) → 회전각(도). 화면 높이만큼 끌면 360°(기존 OrbitControls 체감과 같다). snap 이면 SNAP_DEG 단위로 맞춘다.
 * 부호: 오른쪽·아래로 끌수록 +(보이는 면이 손을 따라간다).
 */
export function dragRotation(px: number, heightPx: number, snap: boolean): { deg: number; snapped: boolean } {
  const raw = (px / Math.max(1, heightPx)) * 360;
  if (!snap) return { deg: raw, snapped: false };
  const s = Math.round(raw / SNAP_DEG) * SNAP_DEG;
  return { deg: Object.is(s, -0) ? 0 : s, snapped: true };
}

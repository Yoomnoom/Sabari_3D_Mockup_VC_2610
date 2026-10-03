// 화면 기준 박스 회전의 순수 계산(DOM·three 에 의존하지 않아 단위 테스트가 가능하다).
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

/**
 * 가상 트랙볼 구면 위의 점(카메라 좌표: x 오른쪽, y 위, z 카메라 쪽). 화면 중심에서 (sx, sy) px 떨어진 커서가 반지름 R px 구에 닿는 점.
 * 구 밖에서도 z 가 0 이 되지 않도록 쌍곡면으로 이어 붙인다(Holroyd) — 어느 위치에서든 값이 연속이다.
 */
export function trackballPoint(sx: number, sy: number, R: number): [number, number, number] {
  const r2 = sx * sx + sy * sy;
  const z = r2 <= (R * R) / 2 ? Math.sqrt(Math.max(0, R * R - r2)) : (R * R) / (2 * Math.sqrt(r2));
  return [sx, sy, z];
}

/**
 * 축 잠금 드래그 한 걸음의 회전각(라디안). a = 잠근 축(카메라 좌표 단위벡터), (mx, my) = 커서 이동 중점의 화면 중심 대비 위치(px, y 위쪽 +),
 * (dx, dy) = 커서 이동량(px, y 위쪽 +), R = 박스 외접구의 화면 반지름(px).
 * 구면 점 p 가 축 둘레로 돌 때 화면에서 움직이는 속도 u = (a × p)ₓᵧ (px/rad) 를 구해, 커서 이동을 u 방향 성분으로 환산한다: dθ = d·u / (|u|² + ε²).
 * 축이 화면 안에 있으면 축에 수직인 이동이, 카메라를 향하면 중심을 도는 원형 이동이 회전이 되고, |u| → 0 이어도 dθ 가 0 으로 연속적으로 줄 뿐 튀지 않는다(ε = 0.25R).
 */
export function lockedStep(a: [number, number, number], mx: number, my: number, dx: number, dy: number, R: number): number {
  const p = trackballPoint(mx, my, R);
  const ux = a[1] * p[2] - a[2] * p[1], uy = a[2] * p[0] - a[0] * p[2];
  const eps = 0.25 * R;
  return (dx * ux + dy * uy) / (ux * ux + uy * uy + eps * eps);
}

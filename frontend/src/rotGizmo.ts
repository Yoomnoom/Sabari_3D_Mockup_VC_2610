// 박스 회전 기즈모: X(빨강)·Y(초록)·Z(파랑) 고리 3개. 눈에 보이는 얇은 고리와, 잡기 쉬운 굵은 투명 고리(선택용)를 함께 둔다.
// 장면(scene)에 직접 붙이며 박스 모델(root) 밖에 있으므로 GLB 내보내기에 들어가지 않고, PNG 캡처 때는 숨긴다.
import * as THREE from 'three';
import { AXIS_COLOR, Axis } from './boxPose';

const AXES: Axis[] = ['x', 'y', 'z'];

export class RotGizmo {
  readonly group = new THREE.Group();
  private visuals = new Map<Axis, THREE.Mesh>();
  private pickers = new Map<Axis, THREE.Mesh>();
  private hovered: Axis | null = null;
  private active: Axis | null = null;
  /** 박스 회전 모드 여부. 아니면 약하게만 보이고 잡을 수 없다. */
  interactive = false;

  constructor(radius: number) {
    this.group.name = '__gizmo';
    this.group.renderOrder = 999;
    for (const a of AXES) {
      const vis = new THREE.Mesh(
        new THREE.TorusGeometry(radius, radius * 0.014, 10, 96),
        new THREE.MeshBasicMaterial({ color: AXIS_COLOR[a], transparent: true, opacity: 0.3, depthTest: false, depthWrite: false }),
      );
      const pick = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.07, 6, 64), new THREE.MeshBasicMaterial({ visible: false }));
      for (const m of [vis, pick]) {
        m.renderOrder = 999;
        // 토러스는 XY 평면(법선 Z)이 기본이다: X 고리 = 법선 X, Y 고리 = 법선 Y
        if (a === 'x') m.rotation.y = Math.PI / 2;
        if (a === 'y') m.rotation.x = Math.PI / 2;
        m.userData.axis = a;
        this.group.add(m);
      }
      this.visuals.set(a, vis);
      this.pickers.set(a, pick);
    }
    this.refresh();
  }

  setInteractive(v: boolean) { this.interactive = v; this.refresh(); }
  setHover(a: Axis | null) { if (a !== this.hovered) { this.hovered = a; this.refresh(); } }
  setActive(a: Axis | null) { this.active = a; this.refresh(); }

  /** 색만으로 구분하지 않도록 라벨은 UI(마우스 옆 라벨·배지)가 따로 보여준다. 여기서는 밝기·굵기로 강조한다. */
  private refresh() {
    for (const a of AXES) {
      const m = this.visuals.get(a)!;
      const mat = m.material as THREE.MeshBasicMaterial;
      const on = a === this.active || a === this.hovered;
      mat.opacity = !this.interactive ? 0.2 : on ? 1 : 0.78;
      m.scale.setScalar(1);
      m.scale.set(1, 1, on ? 2.2 : 1); // 토러스 굵기 방향(두께) 강조
    }
  }

  /** 레이가 맞춘 고리 축(박스 회전 모드일 때만) */
  pick(ray: THREE.Raycaster): Axis | null {
    if (!this.interactive || !this.group.visible) return null;
    this.group.updateMatrixWorld(true);
    const hit = ray.intersectObjects([...this.pickers.values()], false)[0];
    return hit ? (hit.object.userData.axis as Axis) : null;
  }
}

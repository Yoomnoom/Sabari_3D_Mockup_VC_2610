// 씬 기즈모(뷰 큐브): 3D 화면 구석의 작은 큐브. 메인 렌더 뒤에 같은 캔버스의 구석(scissor)에 한 번 더 그린다.
// PNG·GLB 저장은 이 렌더를 거치지 않으므로 큐브가 결과물에 들어가지 않는다(Viewer.renderToCanvas 는 메인 장면만 그린다).
import * as THREE from 'three';

export type CubeView = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

/** BoxGeometry 재질 순서: +X, −X, +Y, −Y, +Z, −Z → 카메라가 +Z 쪽에서 볼 때가 정면 */
const FACE_ORDER: { view: CubeView; label: string }[] = [
  { view: 'right', label: '우' },
  { view: 'left', label: '좌' },
  { view: 'top', label: '위' },
  { view: 'bottom', label: '아래' },
  { view: 'front', label: '정면' },
  { view: 'back', label: '후면' },
];

export const CUBE_SIZE = 96; // CSS px
export const CUBE_MARGIN = 12;

function labelTexture(text: string, bg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#8d8a83'; g.lineWidth = 6; g.strokeRect(3, 3, 122, 122);
  g.fillStyle = '#25231f'; g.font = 'bold 46px "Malgun Gothic", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ViewCube {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  private mesh: THREE.Mesh;
  private hover = -1;

  constructor() {
    const mats = FACE_ORDER.map((f) => new THREE.MeshBasicMaterial({ map: labelTexture(f.label, '#f1efe9') }));
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mats);
    this.scene.add(this.mesh);
  }

  /** 박스 자세를 따라 돌려, 큐브의 면 이름(정면·후면 …)이 박스의 면과 같이 움직이게 한다. */
  setPose(q: THREE.Quaternion) { this.mesh.quaternion.copy(q); }

  /** 메인 카메라와 같은 방향(기울기 포함)으로 보게 한다. */
  syncTo(camera: THREE.Camera) {
    this.camera.quaternion.copy(camera.quaternion);
    this.camera.position.set(0, 0, 3.6).applyQuaternion(camera.quaternion);
  }

  /** 3D 캔버스(clientRect) 안에서 큐브가 그려지는 사각형(client 좌표) */
  rect(canvasRect: DOMRect) {
    return { x: canvasRect.right - CUBE_MARGIN - CUBE_SIZE, y: canvasRect.bottom - CUBE_MARGIN - CUBE_SIZE, w: CUBE_SIZE, h: CUBE_SIZE };
  }

  /** client 좌표가 큐브 위면 눌린 면(없으면 null) */
  pick(clientX: number, clientY: number, canvasRect: DOMRect): CubeView | null {
    const r = this.rect(canvasRect);
    if (clientX < r.x || clientX > r.x + r.w || clientY < r.y || clientY > r.y + r.h) return null;
    return this.faceAt(clientX, clientY, canvasRect);
  }

  private faceAt(clientX: number, clientY: number, canvasRect: DOMRect): CubeView | null {
    const r = this.rect(canvasRect);
    const ndc = new THREE.Vector2(((clientX - r.x) / r.w) * 2 - 1, -(((clientY - r.y) / r.h) * 2 - 1));
    this.camera.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObject(this.mesh)[0];
    if (!hit || hit.face == null) return null;
    return FACE_ORDER[hit.face.materialIndex].view;
  }

  insideRect(clientX: number, clientY: number, canvasRect: DOMRect): boolean {
    const r = this.rect(canvasRect);
    return clientX >= r.x && clientX <= r.x + r.w && clientY >= r.y && clientY <= r.y + r.h;
  }

  setHover(view: CubeView | null) {
    const idx = view ? FACE_ORDER.findIndex((f) => f.view === view) : -1;
    if (idx === this.hover) return;
    this.hover = idx;
    (this.mesh.material as THREE.MeshBasicMaterial[]).forEach((m, i) => m.color.set(i === idx ? '#ffd8bd' : '#ffffff'));
  }

  /** 메인 렌더 뒤에 호출: 캔버스 오른쪽 아래 구석에 그린다. */
  render(renderer: THREE.WebGLRenderer) {
    const size = renderer.getSize(new THREE.Vector2());
    const prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setScissorTest(true);
    const x = size.x - CUBE_MARGIN - CUBE_SIZE, y = CUBE_MARGIN; // viewport 좌표는 왼쪽 아래 기준
    renderer.setViewport(x, y, CUBE_SIZE, CUBE_SIZE);
    renderer.setScissor(x, y, CUBE_SIZE, CUBE_SIZE);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.x, size.y);
    renderer.autoClear = prevAuto;
  }
}

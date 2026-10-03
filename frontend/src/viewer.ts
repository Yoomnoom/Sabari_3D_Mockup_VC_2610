import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { FACES, FaceId, groupOf } from './faces';
import { BoxParams } from './params';
import { TEMPLATE_ID, buildParts } from './templateMesh';
import { dragRotation, lockedStep } from './screenRotate';
import { AXIS_VIEW_NAMES, DIRS, ViewName, viewAxisLocal } from './viewDirs';
export type { ViewName } from './viewDirs';

export type Slot = 'editor' | 'viewer';

interface Model {
  root: THREE.Group;
  lid: THREE.Object3D | null;
  base: THREE.Object3D | null;
  lidBaseY: number;
  /** 화면 전용 박스 자세. pivot(박스 중심, 자세 회전) → shift(−중심) → root 순이라 root 의 변환은 그대로다(GLB 내보내기 불변). */
  pivot: THREE.Group;
}

/** 화면에만 보이는 표시(선택선·축 잠금 면 표시·축 선). 선택·범위 계산·내보내기에서 제외한다. */
const isOverlay = (o: THREE.Object3D) => o.name === '__highlight' || o.name === '__lockhl' || o.name === '__lockaxis';


export class Viewer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.005, 20);
  controls: OrbitControls;
  models: Record<Slot, Model | null> = { editor: null, viewer: null };
  slot: Slot = 'editor';
  faceMeshes = new Map<FaceId, THREE.Mesh>();
  textures = new Map<FaceId, THREE.CanvasTexture>();
  highlight: THREE.LineSegments | null = null;
  selected: FaceId = 'lid_top';
  faceBg = '#ffffff';
  baseBg = '#efece7';
  /** 선택할 수 있는 면인지. 하단 면은 "하단 몸통 디자인 사용"이 꺼져 있으면 클릭해도 선택하지 않는다. */
  pickFilter: ((id: FaceId) => boolean) | null = null;
  onPick: ((id: FaceId) => void) | null = null;
  /** Shift+드래그: 선택된 면 위에서 커서가 움직인 만큼(UV 증가분) 이미지 이동. */
  onDragFace: ((du: number, dv: number) => void) | null = null;
  private hlOn = true;
  /** 이미지 이동 모드: 켜면 Shift 없이도 선택된 면을 끌어 이미지를 옮기고, 휠로 확대·축소한다. */
  moveMode = false;
  panHeld = false;
  canDrag: (() => boolean) | null = null;
  onWheelFace: ((deltaY: number) => void) | null = null;
  private dirty = true;
  private el: HTMLElement;
  private imageDragging = false;
  /** 화면 기준 박스 회전: 카메라는 고정하고 박스만 돌린다(화면 세로축·가로축 기준, 제한 없음). 화면 전용이라 파일에 저장하지 않는다. */
  readonly boxQuat = new THREE.Quaternion();
  onRotateBadge: ((text: string | null, snapping?: boolean) => void) | null = null;
  /** 축 잠금(기본 꺼짐): 켜고 박스 면을 누르면 그 면에 수직인 박스 국소 축이 회전축이 된다. 꺼져 있으면 자유 회전. 화면 전용(저장하지 않음). */
  private lockOn = false;
  private lockFace: FaceId | null = null;
  /** 잠근 축(박스 국소 좌표의 단위 법선) */
  private lockN: THREE.Vector3 | null = null;
  /** 회전축 버튼으로 정한 축의 시점 이름(면 클릭으로 정했으면 null) */
  private lockView: ViewName | null = null;
  /** 선택한 축에 수직인 면(마주 보는 면들)의 약한 테두리 표시 */
  private lockHls: THREE.LineSegments[] = [];
  private lockLine: THREE.Line | null = null;
  /** 앱이 만든 템플릿 GLB(면 이름이 있는 메시)인지: 외부 GLB는 면을 알 수 없어 축 잠금을 쓰지 않는다 */
  private viewerHasFaces = false;
  onLockChange: ((s: { on: boolean; face: FaceId | null; view: ViewName | null; views: ViewName[]; available: boolean }) => void) | null = null;
  onLockHint: ((text: string) => void) | null = null;

  constructor(el: HTMLElement) {
    this.el = el;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
    this.renderer.setClearColor(0xffffff, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    el.appendChild(this.renderer.domElement);

    // 조명: 반구광 + 고정 키라이트 + 카메라를 따라다니는 헤드라이트 (흰 박스가 번들거리지 않게 약하게)
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xe0dbd2, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(1, 2, 1.5);
    this.scene.add(key);
    const head = new THREE.DirectionalLight(0xffffff, 1.0);
    head.position.set(0, 0, 1);
    this.camera.add(head);
    this.scene.add(this.camera);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    this.controls.enableRotate = false; // 회전은 박스 자세(installBoxRotate)가 맡고, OrbitControls 는 확대·이동만 한다
    this.controls.addEventListener('change', () => (this.dirty = true));

    // 크기 갱신은 프레임당 한 번만, 실제로 바뀐 경우에만 한다. (스크롤바·소수점 크기 때문에 매 프레임 반복되면 캔버스가 계속 지워져 빈 화면이 된다)
    let raf = 0;
    new ResizeObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; this.resize(); }); }).observe(el);
    this.resize();
    this.setView('iso');
    this.installPicking();
    this.installBoxRotate();
    const loop = () => {
      requestAnimationFrame(loop);
      if (this.dirty) {
        this.dirty = false;
        this.renderer.render(this.scene, this.camera);
      }
    };
    loop();
  }

  request() { this.dirty = true; }

  resizeCount = 0;
  private lastSize = '';
  resize() {
    // 소수점 크기는 버리고(올림하면 영역을 1px 넘겨 스크롤바가 생길 수 있다) 캔버스 크기는 CSS(100%)에 맡긴다.
    const r = this.el.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width)), h = Math.max(1, Math.floor(r.height));
    const key = `${w}x${h}@${this.renderer.getPixelRatio()}`;
    if (key === this.lastSize) return;
    this.lastSize = key;
    this.resizeCount++;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera); // 지워진 캔버스가 한 프레임이라도 화면에 나가지 않게 바로 그린다
    this.dirty = false;
  }

  private rayAt(e: PointerEvent, objs: THREE.Object3D[], recursive = true) {
    const dom = this.renderer.domElement;
    const r = dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const shown = (o: THREE.Object3D | null): boolean => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; }; // 부모(뚜껑·몸통 그룹)가 숨겨진 메시는 건너뛴다(three 의 raycast 는 부모의 visible 을 보지 않는다)
    return ray.intersectObjects(objs, recursive).filter((h) => shown(h.object) && !isOverlay(h.object));
  }

  private installPicking() {
    const dom = this.renderer.domElement;
    let down: { x: number; y: number } | null = null;
    let drag: THREE.Vector2 | null = null; // Shift+드래그로 이미지 이동 중일 때 직전 UV

    // 캡처 단계: OrbitControls보다 먼저 받아서, Shift+드래그일 때 회전을 막는다.
    dom.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY };
      if (this.panHeld || !(e.shiftKey || this.moveMode) || e.button !== 0 || this.slot !== 'editor' || !this.onDragFace) return;
      if (this.canDrag && !this.canDrag()) return;
      const mesh = this.faceMeshes.get(this.selected);
      const h = mesh && this.rayAt(e, [mesh], false)[0];
      if (h?.uv) {
        drag = h.uv.clone();
        this.imageDragging = true;
        this.controls.enabled = false;
        dom.setPointerCapture(e.pointerId);
      }
    }, true);
    dom.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const mesh = this.faceMeshes.get(this.selected)!;
      const h = this.rayAt(e, [mesh], false)[0];
      if (!h?.uv) return;
      this.onDragFace!(h.uv.x - drag.x, h.uv.y - drag.y); // u→이미지 x, v→이미지 y (v=0이 위)
      drag.copy(h.uv);
    });
    dom.addEventListener('pointerup', (e) => {
      if (drag) { drag = null; this.imageDragging = false; this.controls.enabled = true; down = null; return; }
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || e.button !== 0) return;
      if (this.lockOn && this.lockAvailable()) { this.pickLockAxis(e); return; } // 축 잠금 중의 클릭(터치는 탭)은 축을 정하는 용도이며 편집 면 선택은 바뀌지 않는다
      if (this.slot !== 'editor' || !this.onPick) return;
      const hit = this.rayAt(e, [this.models.editor!.root])[0];
      const id = hit && FACES.find((f) => f.id === hit.object.name)?.id;
      if (id && (!this.pickFilter || this.pickFilter(id))) this.onPick(id);
      else this.setHighlightOn(false); // 박스 바깥이나 면이 아닌 곳(두께면·몸통 등)을 누르면 선택 표시 해제
    });
    dom.addEventListener('wheel', (e) => {
      if (!this.moveMode || this.slot !== 'editor' || !this.onWheelFace || (this.canDrag && !this.canDrag())) return;
      const mesh = this.faceMeshes.get(this.selected);
      if (!mesh || !this.rayAt(e as unknown as PointerEvent, [mesh], false)[0]) return; // 선택된 면 위에서만
      e.preventDefault(); e.stopImmediatePropagation();
      this.onWheelFace(e.deltaY);
    }, { capture: true, passive: false });
    dom.addEventListener('pointercancel', () => { drag = null; this.imageDragging = false; this.controls.enabled = true; });
  }

  // ------------------------------------------------------------ 화면 기준 박스 회전
  /**
   * 왼쪽 드래그(한 손가락 터치 포함) = 박스 회전. Ctrl(Cmd)은 15° 스냅.
   * 자유(기본): 가로 이동은 화면 세로축, 세로 이동은 화면 가로축 기준으로 동시에 반영(대각선 포함, 제한 없음).
   * 축 잠금(면을 눌러 정한 축이 있을 때): 박스 국소 축(그 면의 법선)만 둘레로 돌며, 커서가 면을 따라가도록 트랙볼 구면에서 각을 구한다(screenRotate.lockedStep).
   */
  private installBoxRotate() {
    const dom = this.renderer.domElement;
    const touches = new Set<number>();
    type Drag = { id: number; x: number; y: number; lx: number; ly: number; q0: THREE.Quaternion; up: THREE.Vector3; right: THREE.Vector3; axisW: THREE.Vector3 | null; theta: number; cx: number; cy: number; R: number };
    let g: Drag | null = null;
    const finish = (e: PointerEvent) => {
      touches.delete(e.pointerId);
      if (g && e.pointerId === g.id) { g = null; this.onRotateBadge?.(null); }
    };
    dom.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') { touches.add(e.pointerId); if (touches.size > 1) { g = null; this.onRotateBadge?.(null); return; } } // 두 손가락은 OrbitControls 의 확대·이동
      if (this.panHeld || this.imageDragging) return;
      if (e.pointerType !== 'touch' && (e.button !== 0 || e.shiftKey)) return; // Shift+드래그는 이미지 이동(또는 기존 이동), 다른 버튼은 이동
      this.camera.updateMatrixWorld(true);
      const q = this.camera.quaternion;
      const lockedAxis = this.lockOn && this.lockAvailable() && this.lockN ? this.lockN.clone().applyQuaternion(this.boxQuat).normalize() : null; // 국소 축 → 지금 자세의 월드 축
      const rect = dom.getBoundingClientRect();
      const c = this.cur ? this.cur.pivot.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
      const cs = c.clone().project(this.camera);
      const dist = this.camera.position.distanceTo(c), rWorld = this.bounds().getBoundingSphere(new THREE.Sphere()).radius;
      const R = Math.max(20, (rWorld * rect.height) / 2 / (dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)));
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, q0: this.boxQuat.clone(), up: new THREE.Vector3(0, 1, 0).applyQuaternion(q), right: new THREE.Vector3(1, 0, 0).applyQuaternion(q), axisW: lockedAxis, theta: 0, cx: rect.left + (cs.x * 0.5 + 0.5) * rect.width, cy: rect.top + (-cs.y * 0.5 + 0.5) * rect.height, R };
      if (e.pointerType !== 'touch' && (e.ctrlKey || e.metaKey)) { e.stopImmediatePropagation(); e.preventDefault(); } // Ctrl+드래그가 OrbitControls 의 이동으로 가지 않게
      try { dom.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
    }, true);
    dom.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id || this.imageDragging) return;
      const snap = e.ctrlKey || e.metaKey, h = this.el.clientHeight;
      const sign = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n * 10) / 10)}°`;
      if (!g.axisW) { // 자유 회전: 시작 시점의 화면 축 기준, 가로·세로 이동을 동시에
        const ax = dragRotation(e.clientX - g.x, h, snap), ay = dragRotation(e.clientY - g.y, h, snap);
        if (ax.deg === 0 && ay.deg === 0 && e.clientX === g.x && e.clientY === g.y) return;
        const qa = new THREE.Quaternion().setFromAxisAngle(g.up, THREE.MathUtils.degToRad(ax.deg));
        const qb = new THREE.Quaternion().setFromAxisAngle(g.right, THREE.MathUtils.degToRad(ay.deg));
        this.setBoxQuat(qb.multiply(qa).multiply(g.q0));
        this.onRotateBadge?.(`자유 회전 · 좌우 ${sign(ax.deg)} · 위아래 ${sign(ay.deg)}`, snap);
        return;
      }
      // 축 잠금: 커서 이동을 잠근 축 둘레 각으로 환산해 누적한다
      const cq = this.camera.quaternion.clone().invert();
      const ac = g.axisW.clone().applyQuaternion(cq);
      const s0x = g.lx - g.cx, s0y = -(g.ly - g.cy), s1x = e.clientX - g.cx, s1y = -(e.clientY - g.cy);
      g.theta += lockedStep([ac.x, ac.y, ac.z], (s0x + s1x) / 2, (s0y + s1y) / 2, s1x - s0x, s1y - s0y, g.R);
      g.lx = e.clientX; g.ly = e.clientY;
      let deg = THREE.MathUtils.radToDeg(g.theta);
      if (snap) deg = Math.round(deg / 15) * 15;
      this.setBoxQuat(new THREE.Quaternion().setFromAxisAngle(g.axisW, THREE.MathUtils.degToRad(deg)).multiply(g.q0));
      this.onRotateBadge?.(`${this.lockFace ? FACES.find((f) => f.id === this.lockFace)?.label ?? '' : ''} 축 ${sign(deg)}`.trim(), snap);
    });
    dom.addEventListener('pointerup', finish);
    dom.addEventListener('pointercancel', finish);
  }

  // ------------------------------------------------------------ 축 잠금(면을 눌러 축을 정한다)
  /** 지금 모델에서 축 잠금을 쓸 수 있는지: 편집 모델은 항상, GLB 뷰어는 앱이 만든 템플릿 GLB(면 이름이 있는 메시)일 때만 */
  lockAvailable(): boolean { return this.slot === 'editor' ? !!this.models.editor : this.viewerHasFaces; }
  getLockFace(): FaceId | null { return this.lockFace; }
  getLockView(): ViewName | null { return this.lockView; }
  /** 지금 축과 같은 선인 회전축 버튼들(마주 보는 버튼은 함께 표시된다) */
  lockPressedViews(): ViewName[] { const n = this.lockN; return n ? AXIS_VIEW_NAMES.filter((a) => Math.abs(viewAxisLocal(a).dot(n)) > 1 - 1e-6) : []; }
  isLockOn(): boolean { return this.lockOn; }
  /** 잠근 축을 월드 좌표로(지금 자세 기준). 잠근 축이 없으면 null */
  getLockAxisWorld(): THREE.Vector3 | null { return this.lockN ? this.lockN.clone().applyQuaternion(this.boxQuat).normalize() : null; }
  getLockAxisLocal(): THREE.Vector3 | null { return this.lockN ? this.lockN.clone() : null; }

  setAxisLock(on: boolean) {
    this.lockOn = on && this.lockAvailable();
    if (!this.lockOn) { this.lockFace = null; this.lockN = null; this.lockView = null; }
    this.refreshLockVisuals();
    this.emitLock();
  }

  /** 회전축 버튼으로 축을 정한다(시점 버튼과 달리 카메라는 움직이지 않는다). 면 클릭으로 정한 축과 같은 상태를 쓰며 마지막 선택이 우선이다. */
  setLockView(name: ViewName) {
    if (!this.lockOn || !this.lockAvailable()) return;
    this.lockView = name; this.lockFace = null; this.lockN = viewAxisLocal(name);
    this.refreshLockVisuals();
    this.emitLock();
  }

  private emitLock() { this.onLockChange?.({ on: this.lockOn, face: this.lockFace, view: this.lockView, views: this.lockPressedViews(), available: this.lockAvailable() }); }

  /** 클릭한 면을 축 기준 면으로 정한다. 두께면·안쪽면·배경은 무시하고 안내한다. */
  private pickLockAxis(e: PointerEvent) {
    const m = this.cur;
    const hit = m && this.rayAt(e, [m.root])[0];
    const id = hit && FACES.find((f) => f.id === hit.object.name)?.id;
    if (!hit || !id) { this.onLockHint?.('면을 눌러 주세요'); return; }
    const mesh = hit.object as THREE.Mesh;
    mesh.updateWorldMatrix(true, false);
    const n = new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('normal'), 0).transformDirection(mesh.matrixWorld).applyQuaternion(this.boxQuat.clone().invert()).normalize();
    for (const k of ['x', 'y', 'z'] as const) if (Math.abs(n[k]) < 1e-6) n[k] = 0; // 수치 잡음 정리
    this.lockFace = id; this.lockView = null; this.lockN = n.normalize();
    this.refreshLockVisuals();
    this.emitLock();
  }

  /** 축 잠금 표시: 박스 중심을 지나는 축 선과, 그 축에 수직인 면(마주 보는 면들)의 약한 테두리. 화면에만 보이고 PNG·GLB에는 넣지 않는다. 3/4 처럼 수직인 면이 없는 축은 축 선만 보인다. */
  private refreshLockVisuals() {
    for (const o of this.lockHls) { o.removeFromParent(); o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
    this.lockHls = [];
    this.lockLine?.removeFromParent();
    if (this.lockLine) { this.lockLine.geometry.dispose(); (this.lockLine.material as THREE.Material).dispose(); }
    this.lockLine = null;
    const m = this.cur;
    if (this.lockOn && this.lockN && m) {
      const inv = this.boxQuat.clone().invert();
      for (const f of FACES) {
        const mesh = m.root.getObjectByName(f.id) as THREE.Mesh | undefined;
        if (!mesh?.isMesh) continue;
        mesh.updateWorldMatrix(true, false);
        const n = new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('normal'), 0).transformDirection(mesh.matrixWorld).applyQuaternion(inv);
        if (Math.abs(n.dot(this.lockN)) < 1 - 1e-6) continue;
        const hl = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x1c7ed6, transparent: true, opacity: 0.45, depthTest: false }));
        hl.name = '__lockhl'; hl.renderOrder = 11;
        mesh.add(hl); this.lockHls.push(hl);
      }
      const L = this.bounds().getBoundingSphere(new THREE.Sphere()).radius * 1.3;
      this.lockLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([this.lockN.clone().multiplyScalar(-L), this.lockN.clone().multiplyScalar(L)]), new THREE.LineBasicMaterial({ color: 0x1c7ed6, depthTest: false }));
      this.lockLine.name = '__lockaxis'; this.lockLine.renderOrder = 11;
      m.pivot.add(this.lockLine);
    }
    this.dirty = true;
  }

  /** 화면 전용 박스 자세를 모든 모델에 적용한다. */
  setBoxQuat(q: THREE.Quaternion) {
    this.boxQuat.copy(q).normalize();
    for (const m of Object.values(this.models)) if (m) { m.pivot.quaternion.copy(this.boxQuat); m.pivot.updateMatrixWorld(true); }
    this.dirty = true;
  }
  resetBoxPose() { this.setBoxQuat(new THREE.Quaternion()); }

  /** 모델을 자세용 pivot 아래에 둔다(중심 = 현재 모양의 바운딩 박스 중심). root 변환은 건드리지 않는다. */
  private mountModel(root: THREE.Group): THREE.Group {
    const c = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
    const pivot = new THREE.Group(), shift = new THREE.Group();
    pivot.position.copy(c);
    shift.position.copy(c).negate();
    shift.add(root);
    pivot.add(shift);
    pivot.quaternion.copy(this.boxQuat);
    this.scene.add(pivot);
    return pivot;
  }

  /** 스페이스를 누르는 동안 왼쪽 드래그 = 화면 이동(손 도구). */
  setPanHeld(v: boolean) {
    this.panHeld = v;
    this.controls.mouseButtons.LEFT = v ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    this.el.classList.toggle('panning', v);
  }

  setHighlightOn(v: boolean) {
    this.hlOn = v;
    if (this.highlight) this.highlight.visible = v && this.slot === 'editor';
    this.dirty = true;
  }

  private makeModel(root: THREE.Group): Model {
    const lid = root.getObjectByName('Lid') ?? null;
    // 닫힌 상태 = 뚜껑 y 0 (템플릿 규약). 열린 채 저장된 GLB도 슬라이더에 실제 높이가 표시된다.
    return { root, lid, base: root.getObjectByName('Base') ?? null, lidBaseY: 0, pivot: new THREE.Group() };
  }

  /** 하이라이트·텍스처를 뺀 모델의 GPU 자원을 해제한다. */
  private disposeModel(root: THREE.Object3D) {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
    });
  }

  private partColors: Partial<Record<'lid' | 'base', string>> = {};

  /**
   * 파라미터에서 편집용 템플릿을 (다시) 만든다. 서버·GLB 파일 없이 브라우저에서 만든다.
   * 이미 있으면 교체하고 뚜껑 높이·표시·색상·선택은 유지한다. 면 텍스처는 호출한 쪽이 setFaceTexture 로 다시 연결한다.
   */
  setTemplate(p: BoxParams) {
    const old = this.models.editor;
    const lift = old?.lid ? (old.lid.position.y - old.lidBaseY) * 1000 : 0;
    const lidVisible = old?.lid?.visible ?? true, baseVisible = old?.base?.visible ?? true;
    if (old) { this.highlight?.removeFromParent(); old.pivot.removeFromParent(); this.disposeModel(old.root); }
    for (const t of this.textures.values()) t.dispose(); // 면 크기가 바뀌면 캔버스 크기도 바뀌므로 텍스처를 새로 만든다
    this.textures.clear();
    this.faceMeshes.clear();

    const root = new THREE.Group();
    root.name = 'Template';
    root.userData = { templateId: TEMPLATE_ID, params: { ...p } }; // GLB 로 내보내면 extras 로 들어간다
    const lid = new THREE.Group(); lid.name = 'Lid';
    const base = new THREE.Group(); base.name = 'Base';
    root.add(base, lid); // Python 템플릿의 scene 순서(Base, Lid)와 같다
    for (const part of buildParts(p)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(part.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(part.nrm, 3));
      if (part.editable) g.setAttribute('uv', new THREE.Float32BufferAttribute(part.uv, 2));
      g.setIndex(part.idx);
      const mat = new THREE.MeshStandardMaterial({ metalness: 0, roughness: 0.9 });
      mat.color.setRGB(part.color[0], part.color[1], part.color[2], THREE.LinearSRGBColorSpace); // GLB 의 baseColorFactor 는 선형값
      mat.name = part.name;
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = part.name;
      (part.group === 'base' ? base : lid).add(mesh);
      if (part.editable) this.faceMeshes.set(part.name as FaceId, mesh);
    }
    this.models.editor = { root, lid, base, lidBaseY: 0, pivot: this.mountModel(root) }; // 뚜껑을 올리기 전(닫힌 상태)의 중심을 자세 회전 중심으로 쓴다
    root.visible = this.slot === 'editor';
    lid.position.y = lift / 1000;
    lid.visible = lidVisible; base.visible = baseVisible;
    if (this.partColors.lid) this.setPartColor('lid', this.partColors.lid);
    if (this.partColors.base) this.setPartColor('base', this.partColors.base);
    this.setSelected(this.selected);
    this.refreshLockVisuals();
    this.dirty = true;
  }

  /** 구워진 캔버스를 면 재질에 연결. canvas가 null이면 단색으로 되돌린다. */
  setFaceTexture(id: FaceId, canvas: HTMLCanvasElement | null) {
    const mesh = this.faceMeshes.get(id)!;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!canvas) {
      mat.map = null;
      mat.color.set(groupOf(id) === 'base' ? this.baseBg : this.faceBg); // 하단 면은 "몸통" 색
    } else {
      let tex = this.textures.get(id);
      if (!tex) {
        tex = new THREE.CanvasTexture(canvas);
        tex.flipY = false; // UV는 glTF 규격(v=0이 위)
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        tex.name = id;
        this.textures.set(id, tex);
      }
      tex.needsUpdate = true;
      mat.map = tex;
      mat.color.setRGB(1, 1, 1);
    }
    mat.needsUpdate = true;
    this.dirty = true;
  }

  /** 색상 설정 대상 재질. 'lid'는 두께면(lid_rim)과 안쪽(lid_inner) 둘 다. */
  private partMats(part: 'base' | 'lid'): THREE.MeshStandardMaterial[] {
    const names = part === 'base' ? ['base_rim', 'base_inner'] : ['lid_rim', 'lid_inner'];
    const out: THREE.MeshStandardMaterial[] = [];
    for (const m of [this.models.editor, this.models.viewer]) {
      if (m && m === this.models.editor) m.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && names.includes(mesh.name)) out.push(mesh.material as THREE.MeshStandardMaterial);
      });
    }
    return out;
  }

  getPartColor(part: 'base' | 'lid'): string { return '#' + (this.partMats(part)[0]?.color.getHexString() ?? 'ffffff'); }

  setPartColor(part: 'base' | 'lid', hex: string) {
    this.partColors[part] = hex;
    for (const mat of this.partMats(part)) mat.color.set(hex);
    if (part === 'base') { // 이미지 없는 하단 면도 같은 색
      this.baseBg = hex;
      for (const [id, mesh] of this.faceMeshes) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (groupOf(id) === 'base' && !mat.map) mat.color.set(hex);
      }
    }
    this.dirty = true;
  }

  setFaceBg(hex: string) {
    this.faceBg = hex;
    for (const [id, mesh] of this.faceMeshes) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat.map && groupOf(id) === 'lid') mat.color.set(hex); // 하단 면은 "몸통" 색을 따른다
    }
    this.dirty = true;
  }

  setSelected(id: FaceId) {
    this.selected = id;
    this.highlight?.removeFromParent();
    const mesh = this.faceMeshes.get(id);
    if (!mesh) return;
    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0xe8590c, depthTest: false }),
    );
    this.highlight.renderOrder = 10;
    this.highlight.name = '__highlight';
    this.hlOn = true;
    this.highlight.visible = this.slot === 'editor';
    mesh.add(this.highlight);
    this.dirty = true;
  }

  setSlot(slot: Slot) {
    this.slot = slot;
    for (const k of ['editor', 'viewer'] as Slot[]) {
      const m = this.models[k];
      if (m) m.root.visible = k === slot;
    }
    if (this.highlight) this.highlight.visible = slot === 'editor' && this.hlOn;
    if (this.lockOn && !this.lockAvailable()) this.setAxisLock(false); else { this.refreshLockVisuals(); this.emitLock(); }
    this.dirty = true;
  }

  private get cur(): Model | null { return this.models[this.slot]; }

  hasLid(): boolean { return !!this.cur?.lid; }
  getLiftMm(): number { const m = this.cur; return m?.lid ? (m.lid.position.y - m.lidBaseY) * 1000 : 0; }

  setLiftMm(mm: number) {
    const m = this.cur;
    if (!m?.lid) return;
    m.lid.position.y = m.lidBaseY + mm / 1000;
    this.dirty = true;
  }

  setPartVisible(part: 'lid' | 'base', v: boolean) {
    const o = part === 'lid' ? this.cur?.lid : this.cur?.base;
    if (o) { o.visible = v; this.dirty = true; }
  }

  bounds(): THREE.Box3 {
    const m = this.cur;
    const box = new THREE.Box3();
    if (m) {
      m.pivot.updateMatrixWorld(true); // 부모(자세 pivot)까지 갱신해야 박스를 돌린 뒤에도 범위가 맞다
      m.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible && !isOverlay(o)) box.expandByObject(o); });
    }
    return box.isEmpty() ? new THREE.Box3(new THREE.Vector3(-0.08, 0, -0.06), new THREE.Vector3(0.08, 0.045, 0.06)) : box;
  }

  /** 박스 전체가 화면에 들어오는 카메라 거리. */
  private fitDistance(box: THREE.Box3): number {
    const r = box.getBoundingSphere(new THREE.Sphere()).radius;
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    return (r / Math.sin(Math.min(vfov, hfov) / 2)) * 1.05;
  }

  /**
   * 보는 방향을 바꾼다. 기본은 사용자가 정한 확대(카메라 거리)를 유지하고, 이동(pan)만 박스 중심으로 되돌린다.
   * fit=true면 박스 전체가 보이는 거리로 다시 맞춘다(처음 열기·GLB 불러오기).
   */
  setView(name: ViewName, fit = false) {
    this.resetBoxPose(); // 시점 버튼은 박스를 기본 자세로 되돌린 뒤 보는 방향을 정한다(단계 17의 시점과 같다)
    const box = this.bounds();
    const center = box.getCenter(new THREE.Vector3());
    const dist = fit ? this.fitDistance(box) : this.camera.position.distanceTo(this.controls.target);
    const d = new THREE.Vector3(...DIRS[name]).normalize();
    this.camera.position.copy(center).addScaledVector(d, dist);
    this.camera.up.set(0, 1, 0);
    this.controls.target.copy(center);
    this.controls.update();
    this.dirty = true;
  }

  /** 위치 초기화(화면에 맞추기): 지금 보는 방향은 그대로, 확대와 이동만 처음 상태로. */
  fit() {
    const box = this.bounds();
    const center = box.getCenter(new THREE.Vector3());
    const d = this.camera.position.clone().sub(this.controls.target).normalize();
    if (d.lengthSq() < 0.5) d.set(...DIRS.iso).normalize();
    this.camera.position.copy(center).addScaledVector(d, this.fitDistance(box));
    this.controls.target.copy(center);
    this.controls.update();
    this.dirty = true;
  }

  /** 검증용: 면 꼭짓점의 화면 좌표(CSS px). 번짐 검사에 쓴다. */
  faceCorners(id: FaceId): [number, number][] {
    const mesh = this.faceMeshes.get(id)!;
    mesh.updateWorldMatrix(true, false);
    this.camera.updateMatrixWorld(true);
    const pos = mesh.geometry.getAttribute('position');
    const w = this.renderer.domElement.clientWidth, h = this.renderer.domElement.clientHeight;
    const out: [number, number][] = [];
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).project(this.camera);
      out.push([(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h]);
    }
    return out;
  }

  /** 검증용: 카메라를 직접 지정. */
  setCameraRaw(pos: [number, number, number], target: [number, number, number]) {
    this.camera.position.set(...pos);
    this.controls.target.set(...target);
    this.controls.update();
    this.camera.updateMatrixWorld(true);
    this.dirty = true;
  }

  async loadExternal(buf: ArrayBuffer) {
    const gltf = await new GLTFLoader().parseAsync(buf, '');
    this.models.viewer?.pivot.removeFromParent();
    const m = this.makeModel(gltf.scene);
    m.pivot = this.mountModel(gltf.scene);
    this.models.viewer = m;
    this.viewerHasFaces = false;
    gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && FACES.some((f) => f.id === o.name)) this.viewerHasFaces = true; });
    if (this.slot === 'viewer') this.emitLock();
    let meshes = 0, textured = 0;
    m.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes++;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (mats.some((x) => (x as THREE.MeshStandardMaterial).map)) textured++;
      // 편집 모드와 같은 선명도: 로더 기본값(이방성 1)이면 비스듬히 볼 때 텍스처가 흐려진다.
      for (const mat of mats) {
        const m = mat as THREE.MeshStandardMaterial;
        for (const tex of [m.map, m.emissiveMap, m.normalMap, m.roughnessMap, m.metalnessMap, m.aoMap]) {
          if (tex) { tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy(); tex.needsUpdate = true; }
        }
      }
    });
    const found: { params: Record<string, number> | null } = { params: null };
    gltf.scene.traverse((o) => { const pr = (o.userData as { params?: Record<string, number> })?.params; if (!found.params && pr && typeof pr.baseW === 'number') found.params = pr; });
    return { meshes, textured, hasLid: !!m.lid, params: found.params };
  }

  private renderToCanvas(scale: number): HTMLCanvasElement {
    const hl = this.highlight?.visible, lh = this.lockHls.map((o) => o.visible), ll = this.lockLine?.visible;
    if (this.highlight) this.highlight.visible = false;
    for (const o of this.lockHls) o.visible = false;
    if (this.lockLine) this.lockLine.visible = false;
    const pr = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(Math.max(pr, 1) * scale);
    this.renderer.render(this.scene, this.camera);
    const out = document.createElement('canvas');
    const src = this.renderer.domElement;
    out.width = src.width; out.height = src.height;
    out.getContext('2d')!.drawImage(src, 0, 0);
    this.renderer.setPixelRatio(pr);
    if (this.highlight) this.highlight.visible = !!hl;
    this.lockHls.forEach((o, i) => { o.visible = lh[i] !== false; });
    if (this.lockLine) this.lockLine.visible = ll !== false;
    this.dirty = true;
    return out;
  }

  /**
   * 검증 전용: 메시마다 고유한 단색(ID)으로 칠한 화면을 screenshot 과 같은 크기로 그려 돌려준다.
   * 조명·텍스처 없이 "각 픽셀에 실제로 어느 메시가 보이는지"를 알려 번짐 측정의 기준이 된다. 앱 동작에는 쓰지 않는다.
   * ID = 이름 목록(names)의 1부터 시작하는 순번이 R 채널에 들어간다. 0 = 배경.
   */
  debugIdMap(): { w: number; h: number; data: Uint8ClampedArray; names: string[] } {
    const names: string[] = [];
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    this.cur!.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || isOverlay(mesh)) return;
      names.push(mesh.name);
      swapped.push([mesh, mesh.material]);
      const mat = new THREE.MeshBasicMaterial();
      mat.color.setRGB(names.length / 255, 0, 0, THREE.LinearSRGBColorSpace);
      mesh.material = mat;
    });
    const cs = this.renderer.outputColorSpace;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    const cv = this.renderToCanvas(2);
    this.renderer.outputColorSpace = cs;
    for (const [mesh, mat] of swapped) { (mesh.material as THREE.Material).dispose(); mesh.material = mat; }
    this.dirty = true;
    return { w: cv.width, h: cv.height, data: cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data, names };
  }

  /** 현재 화면 그대로 PNG. 배경은 흰색 또는 투명 (체크무늬 없음). */
  async screenshot(bg: 'white' | 'transparent'): Promise<Blob> {
    const c = this.renderToCanvas(2);
    let target = c;
    if (bg === 'white') {
      target = document.createElement('canvas');
      target.width = c.width; target.height = c.height;
      const ctx = target.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(c, 0, 0);
    }
    return new Promise((res, rej) => target.toBlob((b) => (b ? res(b) : rej(new Error('PNG 생성 실패'))), 'image/png'));
  }

  /** 편집 중인 모델을 GLB로. 텍스처는 면별로 구워진 캔버스가 PNG로 임베드된다. */
  async exportGLB(): Promise<ArrayBuffer> {
    const m = this.models.editor!;
    const saved: [THREE.Object3D, boolean][] = [];
    m.root.traverse((o) => saved.push([o, o.visible]));
    m.root.traverse((o) => { o.visible = !isOverlay(o); });
    try {
      const r = await new GLTFExporter().parseAsync(m.root, { binary: true, onlyVisible: true });
      return r as ArrayBuffer;
    } finally {
      for (const [o, v] of saved) o.visible = v;
    }
  }
}

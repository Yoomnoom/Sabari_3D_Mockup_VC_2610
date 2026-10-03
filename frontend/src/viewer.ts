import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { FACES, FaceId, groupOf } from './faces';
import { BoxParams } from './params';
import { TEMPLATE_ID, buildParts } from './templateMesh';

export type ViewName = 'front' | 'back' | 'left' | 'right' | 'top' | 'iso' | 'isoL' | 'bottom';
export type Slot = 'editor' | 'viewer';

interface Model {
  root: THREE.Group;
  lid: THREE.Object3D | null;
  base: THREE.Object3D | null;
  lidBaseY: number;
}

const DIRS: Record<ViewName, [number, number, number]> = {
  front: [0, 0.12, 1], back: [0, 0.12, -1], left: [-1, 0.12, 0], right: [1, 0.12, 0],
  top: [0, 1, 0.0001], iso: [0.9, 0.75, 1.05], isoL: [-0.9, 0.75, -1.05], bottom: [0, -1, 0.0001], // bottom: 아래에서 올려다봄(화면 위쪽 = 앞) // R = 앞·오른쪽 날개가 보이는 모서리, L = 그 반대 모서리(뒤·왼쪽 날개)
};

export class Viewer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.005, 20);
  /**
   * 카메라 조작: OrbitControls 는 확대·이동(마우스·터치)과 "수평 유지 회전"에 쓴다.
   * 자유 회전(기본)은 아래 turntable 코드가 직접 처리한다 — 가로 드래그 = 월드 위쪽 축 기준, 세로 드래그 = 화면 가로축 기준이며
   * 롤이 쌓이지 않는다. 박스는 월드에 고정이고 카메라만 돈다(이후 바닥 그림자·고정 배경 대비).
   */
  readonly orbit: OrbitControls;
  levelRotate = false;
  get controls(): OrbitControls { return this.orbit; }
  /** 회전 속도 배율(마우스·터치 공통). 3 = 기본: 3D 화면 높이만큼 끌면 180° 돈다. */
  rotateSpeed = 3;
  /** 카메라 각도가 바뀔 때마다(회전·이동·시점 변경·입력) 호출된다. 각도 표시 갱신용. */
  onCamera: (() => void) | null = null;
  private imageDragging = false;
  /**
   * 기울기(롤, 도): 보는 방향 축을 기준으로 화면을 돌린 각도. +는 화면(박스)이 시계 방향으로 기울어 보이는 방향, 0 = 수평.
   * camera.up(턴테이블 기준 위쪽)은 건드리지 않고 lookAt 직후의 방향에 롤만 더한다. 그래서 드래그·90° 회전·속도·수평 유지 토글이 값을 바꾸지 않는다.
   */
  roll = 0;
  /** 회전 가능한 최소/최대 카메라 거리(박스 중심 기준 m). 최소는 박스 안으로 들어가 잘리는 것을 막는다. */
  static readonly MIN_DIST = 0.1;
  static readonly MAX_DIST = 2;
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

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = false;
    this.orbit.enableRotate = false; // 자유 회전은 직접 처리. 수평 유지 회전을 켤 때만 OrbitControls 가 회전한다.
    this.orbit.minDistance = Viewer.MIN_DIST; this.orbit.maxDistance = Viewer.MAX_DIST;
    this.orbit.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    this.orbit.addEventListener('change', () => { this.dirty = true; this.onCamera?.(); });

    let raf = 0;
    new ResizeObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; this.resize(); }); }).observe(el);
    this.resize();
    this.setView('iso');
    this.installPicking();
    this.installTurntable();
    const loop = () => {
      requestAnimationFrame(loop);
      if (this.dirty) {
        this.dirty = false;
        if (this.roll !== 0) this.syncCamera();
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
    return ray.intersectObjects(objs, recursive).filter((h) => h.object.visible && h.object.name !== '__highlight');
  }

  private installPicking() {
    const dom = this.renderer.domElement;
    let down: { x: number; y: number } | null = null;
    let drag: THREE.Vector2 | null = null; // Shift+드래그로 이미지 이동 중일 때 직전 UV
    const setDrag = (v: THREE.Vector2 | null) => { drag = v; this.imageDragging = v !== null; };

    // 캡처 단계: OrbitControls보다 먼저 받아서, Shift+드래그일 때 회전을 막는다.
    dom.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY };
      if (this.panHeld || !(e.shiftKey || this.moveMode) || e.button !== 0 || this.slot !== 'editor' || !this.onDragFace) return;
      if (this.canDrag && !this.canDrag()) return;
      const mesh = this.faceMeshes.get(this.selected);
      const h = mesh && this.rayAt(e, [mesh], false)[0];
      if (h?.uv) {
        setDrag(h.uv.clone());
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
      if (drag) { setDrag(null); this.controls.enabled = true; down = null; return; }
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || e.button !== 0) return;
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
    dom.addEventListener('pointercancel', () => { setDrag(null); this.controls.enabled = true; });
  }

  // ------------------------------------------------------------ 턴테이블형 자유 회전
  /**
   * 각도 매개변수: 카메라 위치 = 중심 + 거리·(cosE·sinA, sinE, cosE·cosA). A=좌우(방위각), E=상하(고도, 제한 없음).
   * E 가 ±90° 를 넘으면 cosE<0 이 되어 박스가 뒤집혀 보인다. 화면 위쪽 = ∂p/∂E 이므로 극점을 지나도 끊기지 않고 롤이 생기지 않는다.
   */
  private rotState(): { A: number; E: number; dist: number } {
    const d = this.camera.position.clone().sub(this.controls.target);
    const dist = d.length();
    const el = Math.asin(THREE.MathUtils.clamp(d.y / dist, -1, 1));
    let A = Math.atan2(d.x, d.z), E = el;
    if (Math.abs(d.y / dist) > 0.9999) { // 극점: 방위각은 화면 위쪽 방향에서 읽는다
      const u = this.camera.up;
      if (Math.hypot(u.x, u.z) > 0.5) A = d.y > 0 ? Math.atan2(-u.x, -u.z) : Math.atan2(u.x, u.z); // up 이 수평이면 거기서, 아니면(up=Y) 시선의 수평 성분에서
    } else if (this.camera.up.y < -1e-6) { E = Math.PI - el; A += Math.PI; } // 뒤집힌 상태
    return { A, E, dist };
  }

  /** lookAt 로 방향을 새로 잡고 기울기를 더한다. OrbitControls 의 update 가 lookAt 으로 방향을 덮어쓰므로 렌더·읽기 전에 호출한다. */
  syncCamera() {
    this.camera.lookAt(this.controls.target);
    if (this.roll !== 0) {
      const f = this.controls.target.clone().sub(this.camera.position).normalize();
      // 카메라를 보는 방향 축으로 −roll 만큼 돌리면 화면 속 박스가 +roll(시계 방향)로 기울어 보인다
      this.camera.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(f, -THREE.MathUtils.degToRad(this.roll)));
    }
    this.camera.updateMatrixWorld(true);
  }

  /** 기울기를 지정한다(도, −180~180). 방향·거리·확대는 그대로. */
  setRoll(deg: number) {
    let r = ((deg + 180) % 360 + 360) % 360 - 180;
    if (Math.abs(r) < 1e-9) r = 0;
    this.roll = r;
    this.syncCamera(); this.dirty = true; this.onCamera?.();
  }

  private applyRot(A: number, E: number, dist: number) {
    const c = this.controls.target;
    const sA = Math.sin(A), cA = Math.cos(A), sE = Math.sin(E), cE = Math.cos(E);
    this.camera.position.set(c.x + dist * cE * sA, c.y + dist * sE, c.z + dist * cE * cA);
    this.camera.up.set(-sE * sA, cE, -sE * cA).normalize(); // 화면 위쪽 = ∂p/∂E
    this.camera.lookAt(c);
    this.controls.update();
    this.syncCamera();
    this.dirty = true;
    this.onCamera?.();
  }

  /** 드래그 이동량 → 라디안. 기본 속도(3)에서 3D 화면 높이만큼 끌면 180°. */
  private radPerPx(): number { return (this.rotateSpeed / 3) * Math.PI / Math.max(1, this.el.clientHeight); }

  private installTurntable() {
    const dom = this.renderer.domElement;
    let g: { id: number; x: number; y: number; A: number; E: number; dist: number } | null = null;
    const touches = new Map<number, { x: number; y: number }>();
    let rollDrag: { id: number; x: number; roll: number } | null = null;
    let twist: number | null = null; // 두 손가락 사이 각도(직전)
    const twistAngle = () => { const [a, b2] = [...touches.values()]; return Math.atan2(b2.y - a.y, b2.x - a.x); };
    dom.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) twist = twistAngle();
      // Alt+왼쪽 드래그: 기울기. OrbitControls(수평 유지 모드의 회전 포함)가 같이 반응하지 않도록 여기서 끊는다.
      // (Shift+드래그는 이미지 이동이라 겹치지 않는다. 단축키 설정과 무관한 마우스 조작이다.)
      if (e.pointerType !== 'touch' && e.button === 0 && e.altKey && !e.shiftKey && !this.panHeld) {
        rollDrag = { id: e.pointerId, x: e.clientX, roll: this.roll };
        e.stopImmediatePropagation(); e.preventDefault();
        try { dom.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
        return;
      }
      if (touches.size > 1) { g = null; return; } // 두 손가락은 OrbitControls 의 확대·이동
      if (this.levelRotate || this.panHeld || this.imageDragging || e.shiftKey && this.slot === 'editor' && this.onDragFace && (this.canDrag?.() ?? true) && this.rayAt(e, [this.faceMeshes.get(this.selected)!], false)[0]) return;
      if (e.pointerType !== 'touch' && e.button !== 0) return;
      const st = this.rotState();
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, ...st };
    }, true);
    dom.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' && touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (rollDrag && e.pointerId === rollDrag.id) { // 오른쪽으로 끌면 시계 방향(+)
        this.setRoll(rollDrag.roll + THREE.MathUtils.radToDeg((e.clientX - rollDrag.x) * this.radPerPx()));
        return;
      }
      if (touches.size === 2 && twist !== null) { // 두 손가락 비틀기: 시계 방향으로 비틀면 +
        const a = twistAngle(); let da = a - twist; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
        twist = a; if (Math.abs(da) > 1e-4) this.setRoll(this.roll + THREE.MathUtils.radToDeg(da));
      }
      if (!g || e.pointerId !== g.id || this.imageDragging || this.levelRotate) return;
      const k = this.radPerPx();
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      // 뒤집힌 상태(cosE<0)에서는 화면 오른쪽이 월드 기준으로 반대이므로 방위각 방향을 뒤집어 "박스가 손을 따라가게" 한다.
      const flipped = Math.cos(g.E) < 0;
      const A = g.A + (flipped ? 1 : -1) * dx * k;
      const E = g.E + dy * k;
      this.applyRot(A, E, g.dist);
    });
    const end = (e: PointerEvent) => { touches.delete(e.pointerId); if (touches.size < 2) twist = null; if (rollDrag && e.pointerId === rollDrag.id) rollDrag = null; if (g && e.pointerId === g.id) g = null; };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
  }

  /** 화면에 보여줄 각도(도). az: −180~180, 0=정면(카메라가 +Z), +=카메라가 오른쪽(+X)으로. el: −90~90, 0=수평, +=위에서. flipped: 뒤집혀 보이는지. */
  getAngles(): { az: number; el: number; roll: number; flipped: boolean; pole: boolean } {
    const d = this.camera.position.clone().sub(this.controls.target);
    const len = d.length() || 1;
    const el = Math.asin(THREE.MathUtils.clamp(d.y / len, -1, 1));
    const A = Math.abs(d.y / len) > 0.9999 ? this.rotState().A : Math.atan2(d.x, d.z);
    const deg = THREE.MathUtils.radToDeg;
    let az = deg(A); az = ((az + 180) % 360 + 360) % 360 - 180;
    return { az: +az.toFixed(1), el: +deg(el).toFixed(1), roll: +this.roll.toFixed(1), flipped: this.camera.up.y < -1e-6, pole: Math.abs(d.y / len) > 0.99985 };
  }

  /** 각도를 직접 지정한다(도). 거리·확대·이동은 유지하고 뒤집힘은 풀린다. */
  setAngles(azDeg: number, elDeg: number) {
    const el = THREE.MathUtils.clamp(elDeg, -90, 90);
    this.applyRot(THREE.MathUtils.degToRad(azDeg), THREE.MathUtils.degToRad(el), this.rotState().dist);
  }

  /** 90° 단위 회전. dir: 'left'|'right' = 방위각 ∓90°, 'up'|'down' = 고도 ±90°. 4번 누르면 원래 각도로 돌아온다. */
  rotate90(dir: 'left' | 'right' | 'up' | 'down') {
    const s = this.rotState();
    const q = Math.PI / 2;
    const flipped = Math.cos(s.E) < -1e-9;
    if (dir === 'left' || dir === 'right') this.applyRot(s.A + ((dir === 'left') !== flipped ? 1 : -1) * q, s.E, s.dist);
    else this.applyRot(s.A, s.E + (dir === 'up' ? -1 : 1) * q, s.dist);
  }

  /** 수평 맞추기: 바라보는 방향(카메라 위치)은 그대로 두고 기울기만 바로잡는다. 뒤집혀 있으면 같은 위치에서 위쪽을 세워 똑바로 보이게 한다. */
  levelHorizon() {
    const hadRoll = this.roll !== 0;
    const d = this.camera.position.clone().sub(this.controls.target).normalize();
    const pole = Math.abs(d.y) > 0.9999; // 위·아래 시점: 뒤집힘(up 반전)은 정할 수 없고 기울기 값만 0 으로 한다
    this.roll = 0;
    if (!pole) this.camera.up.set(0, 1, 0); // 뒤집혀 있었다면 같은 위치에서 위쪽을 세운다
    this.camera.lookAt(this.controls.target);
    this.controls.update(); this.syncCamera(); this.dirty = true; this.onCamera?.();
    return !pole || hadRoll;
  }

  /** 수평 유지 회전 켜기/끄기. 켜면 위쪽 방향을 바로잡고 극점에서 멈추는 OrbitControls 회전으로 바꾼다. */
  setLevelRotate(v: boolean) {
    if (v === this.levelRotate) return;
    this.levelRotate = v;
    this.orbit.enableRotate = v;
    if (v) { this.camera.up.set(0, 1, 0); this.camera.lookAt(this.controls.target); }
    this.orbit.update();
    this.dirty = true; this.onCamera?.();
  }

  /** 스페이스를 누르는 동안 왼쪽 드래그 = 화면 이동(손 도구). */
  setPanHeld(v: boolean) {
    this.panHeld = v;
    this.orbit.mouseButtons.LEFT = v ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
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
    return { root, lid, base: root.getObjectByName('Base') ?? null, lidBaseY: 0 };
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
    if (old) { this.highlight?.removeFromParent(); this.scene.remove(old.root); this.disposeModel(old.root); }
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
    this.models.editor = { root, lid, base, lidBaseY: 0 };
    this.scene.add(root);
    this.updateLimits();
    root.visible = this.slot === 'editor';
    lid.position.y = lift / 1000;
    lid.visible = lidVisible; base.visible = baseVisible;
    if (this.partColors.lid) this.setPartColor('lid', this.partColors.lid);
    if (this.partColors.base) this.setPartColor('base', this.partColors.base);
    this.setSelected(this.selected);
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
      m.root.updateMatrixWorld(true);
      m.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible && o.name !== '__highlight') box.expandByObject(o); });
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
    const box = this.bounds();
    const center = box.getCenter(new THREE.Vector3());
    const dist = fit ? this.fitDistance(box) : this.camera.position.distanceTo(this.controls.target);
    const d = new THREE.Vector3(...DIRS[name]).normalize();
    this.camera.position.copy(center).addScaledVector(d, dist);
    this.camera.up.set(0, 1, 0);
    this.roll = 0; // 시점 버튼은 기울기도 0 으로 되돌린다("그 시점" 그대로 보이게)
    this.controls.target.copy(center);
    this.controls.update();
    this.syncCamera();
    this.dirty = true;
    this.onCamera?.();
  }

  /** 위치 초기화(화면에 맞추기): 지금 보는 방향은 그대로, 확대와 이동만 처음 상태로. */
  fit() {
    const box = this.bounds();
    const center = box.getCenter(new THREE.Vector3());
    const d = this.camera.position.clone().sub(this.controls.target).normalize();
    if (d.lengthSq() < 0.5) d.set(...DIRS.iso).normalize();
    this.camera.position.copy(center).addScaledVector(d, this.fitDistance(box));
    if (Math.abs(d.y) < 0.9999) this.camera.up.set(0, 1, 0); // 자유 회전으로 뒤집혀 있어도 위쪽 방향을 바로잡는다(바라보는 방향은 유지, 극점은 현재 up 유지)
    this.roll = 0;
    this.controls.target.copy(center);
    this.updateLimits(box);
    this.controls.update();
    this.syncCamera();
    this.dirty = true;
    this.onCamera?.();
  }

  /** 확대 한계를 박스 크기에서 정한다: 최소 = 박스를 감싸는 구의 반지름(카메라가 박스 안으로 들어가 near plane 에 잘리는 것을 막음), 최대 = 전체 보기 거리의 4배. */
  private updateLimits(box = this.bounds()) {
    const r = box.getBoundingSphere(new THREE.Sphere()).radius;
    this.orbit.minDistance = r * 1.0;
    this.orbit.maxDistance = Math.max(Viewer.MAX_DIST, this.fitDistance(box) * 4);
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
    this.camera.up.set(0, 1, 0);
    this.roll = 0;
    this.controls.target.set(...target);
    this.controls.update();
    this.syncCamera();
    this.camera.updateMatrixWorld(true);
    this.dirty = true;
  }

  async loadExternal(buf: ArrayBuffer) {
    const gltf = await new GLTFLoader().parseAsync(buf, '');
    this.models.viewer?.root.removeFromParent();
    const m = this.makeModel(gltf.scene);
    this.models.viewer = m;
    this.scene.add(m.root);
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
    this.syncCamera(); // 기울기가 적용된 현재 화면 그대로 저장한다
    const hl = this.highlight?.visible;
    if (this.highlight) this.highlight.visible = false;
    const pr = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(Math.max(pr, 1) * scale);
    this.renderer.render(this.scene, this.camera);
    const out = document.createElement('canvas');
    const src = this.renderer.domElement;
    out.width = src.width; out.height = src.height;
    out.getContext('2d')!.drawImage(src, 0, 0);
    this.renderer.setPixelRatio(pr);
    if (this.highlight) this.highlight.visible = !!hl;
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
      if (!mesh.isMesh || mesh.name === '__highlight') return;
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
    m.root.traverse((o) => { o.visible = o.name !== '__highlight'; });
    try {
      const r = await new GLTFExporter().parseAsync(m.root, { binary: true, onlyVisible: true });
      return r as ArrayBuffer;
    } finally {
      for (const [o, v] of saved) o.visible = v;
    }
  }
}

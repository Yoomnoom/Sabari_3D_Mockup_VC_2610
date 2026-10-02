import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { FACES, FaceId } from './faces';

export type ViewName = 'front' | 'back' | 'left' | 'right' | 'top' | 'iso';
export type Slot = 'editor' | 'viewer';

interface Model {
  root: THREE.Group;
  lid: THREE.Object3D | null;
  base: THREE.Object3D | null;
  lidBaseY: number;
}

const DIRS: Record<ViewName, [number, number, number]> = {
  front: [0, 0.12, 1], back: [0, 0.12, -1], left: [-1, 0.12, 0], right: [1, 0.12, 0],
  top: [0, 1, 0.0001], iso: [0.9, 0.75, 1.05],
};

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

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    this.controls.addEventListener('change', () => (this.dirty = true));

    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    this.setView('iso');
    this.installPicking();
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

  resize() {
    const w = Math.max(1, this.el.clientWidth), h = Math.max(1, this.el.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
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

    // 캡처 단계: OrbitControls보다 먼저 받아서, Shift+드래그일 때 회전을 막는다.
    dom.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY };
      if (this.panHeld || !(e.shiftKey || this.moveMode) || e.button !== 0 || this.slot !== 'editor' || !this.onDragFace) return;
      if (this.canDrag && !this.canDrag()) return;
      const mesh = this.faceMeshes.get(this.selected);
      const h = mesh && this.rayAt(e, [mesh], false)[0];
      if (h?.uv) {
        drag = h.uv.clone();
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
      if (drag) { drag = null; this.controls.enabled = true; down = null; return; }
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || e.button !== 0) return;
      if (this.slot !== 'editor' || !this.onPick) return;
      const hit = this.rayAt(e, [this.models.editor!.root])[0];
      const id = hit && FACES.find((f) => f.id === hit.object.name)?.id;
      if (id) this.onPick(id);
      else this.setHighlightOn(false); // 박스 바깥이나 면이 아닌 곳(두께면·몸통 등)을 누르면 선택 표시 해제
    });
    dom.addEventListener('wheel', (e) => {
      if (!this.moveMode || this.slot !== 'editor' || !this.onWheelFace || (this.canDrag && !this.canDrag())) return;
      const mesh = this.faceMeshes.get(this.selected);
      if (!mesh || !this.rayAt(e as unknown as PointerEvent, [mesh], false)[0]) return; // 선택된 면 위에서만
      e.preventDefault(); e.stopImmediatePropagation();
      this.onWheelFace(e.deltaY);
    }, { capture: true, passive: false });
    dom.addEventListener('pointercancel', () => { drag = null; this.controls.enabled = true; });
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
    return { root, lid, base: root.getObjectByName('Base') ?? null, lidBaseY: 0 };
  }

  async loadTemplate(url: string) {
    const gltf = await new GLTFLoader().loadAsync(url);
    const m = this.makeModel(gltf.scene);
    this.models.editor = m;
    this.scene.add(m.root);
    for (const f of FACES) {
      const mesh = m.root.getObjectByName(f.id) as THREE.Mesh | undefined;
      if (!mesh) throw new Error(`템플릿에 ${f.id} 면이 없습니다.`);
      mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone();
      this.faceMeshes.set(f.id, mesh);
    }
    this.setSelected(this.selected);
    this.dirty = true;
  }

  /** 구워진 캔버스를 면 재질에 연결. canvas가 null이면 단색으로 되돌린다. */
  setFaceTexture(id: FaceId, canvas: HTMLCanvasElement | null) {
    const mesh = this.faceMeshes.get(id)!;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!canvas) {
      mat.map = null;
      mat.color.set(this.faceBg);
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
    const names = part === 'base' ? ['Base'] : ['lid_rim', 'lid_inner'];
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
    for (const mat of this.partMats(part)) mat.color.set(hex);
    this.dirty = true;
  }

  setFaceBg(hex: string) {
    this.faceBg = hex;
    for (const mesh of this.faceMeshes.values()) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat.map) mat.color.set(hex);
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

  setView(name: ViewName) {
    const box = this.bounds();
    const center = box.getCenter(new THREE.Vector3());
    const r = box.getBoundingSphere(new THREE.Sphere()).radius;
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const dist = (r / Math.sin(Math.min(vfov, hfov) / 2)) * 1.05;
    const d = new THREE.Vector3(...DIRS[name]).normalize();
    this.camera.position.copy(center).addScaledVector(d, dist);
    this.camera.up.set(0, 1, 0);
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
    return { meshes, textured, hasLid: !!m.lid };
  }

  private renderToCanvas(scale: number): HTMLCanvasElement {
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

import * as THREE from 'three';

/**
 * 바닥 그림자(화면·PNG 전용). 눈에 보이지 않는 바닥판을 박스가 놓이는 높이에 깔고 ShadowMaterial 로 그림자만 반투명하게 그린다.
 * 구현 선택과 이유:
 * - 박스 재질은 조명 항을 쓰지 않는다(shading.ts: 출력 = 색 × 음영 계수). 그래서 씬에 빛을 하나 더해도 박스 색은 그대로이고, 빛은 그림자 맵에만 쓰인다.
 * - 그림자 맵은 VSM(분산 그림자 맵): 반지름·블러 샘플로 가장자리 부드러움을 슬라이더 하나로 연속 조절할 수 있다(PCF 는 반지름을 키우면 줄무늬가 생긴다).
 * - ShadowMaterial 은 알파로만 그린다. 투명 PNG 에서는 (0,0,0,알파)로 저장되어 가장자리에 흰선이 생기지 않는다.
 * - 바닥판은 앞면만 그린다(아래에서 올려다볼 때 보이지 않음), 깊이는 쓰지 않는다.
 */
export interface ShadowSettings {
  on: boolean;
  strength: number; // 0~1, 그림자 진하기
  soft: number; // 0~1, 가장자리 부드러움
  az: number; // 좌우 0~360°: 0 = 앞(+Z)에서, 90 = 오른쪽(+X)에서, 225 = 뒤 왼쪽에서 비춘다
  el: number; // 높이 20~80°
}
/** 기본 빛 방향(작업 10): 뒤 왼쪽 위(225°, 65°)에서 비춰 그림자가 박스 앞쪽 오른쪽 아래로 떨어진다. 3/4 시점·세운 3/4 좌우 세 구도에서 그림자가 박스에 가려지지 않는 최대값을 렌더 측정(e2e/shadow_default_sweep.mjs)으로 골랐다. */
export const DEFAULT_SHADOW: ShadowSettings = { on: false, strength: 0.4, soft: 0.5, az: 225, el: 65 };
/** 그림자 맵 크기: 회전이 끊기지 않는 선에서 가장자리 해상도를 확보한다(2048² 1장, 렌더마다 갱신). */
export const SHADOW_MAP_SIZE = 2048;

export function sanitizeShadow(s: Partial<ShadowSettings> | null | undefined): ShadowSettings {
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    on: s?.on === true,
    strength: num(s?.strength, 0, 1, DEFAULT_SHADOW.strength),
    soft: num(s?.soft, 0, 1, DEFAULT_SHADOW.soft),
    az: ((num(s?.az, -1e6, 1e6, DEFAULT_SHADOW.az) % 360) + 360) % 360,
    el: num(s?.el, 20, 80, DEFAULT_SHADOW.el),
  };
}

export class FloorShadow {
  private light = new THREE.DirectionalLight(0xffffff, 1);
  private floor: THREE.Mesh;
  private mat = new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.4, transparent: true, depthWrite: false, side: THREE.FrontSide });
  private settings: ShadowSettings = { ...DEFAULT_SHADOW };
  /** 마지막으로 계산한 바닥 높이(월드 y) — 검증·접촉 확인용 */
  floorY: number | null = null;

  constructor(scene: THREE.Scene, private renderer: THREE.WebGLRenderer) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.shadowMap.autoUpdate = false; // 그릴 때마다 우리가 갱신한다(꺼져 있으면 그림자 패스 자체가 없다)
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    this.light.shadow.blurSamples = 16;
    this.light.shadow.bias = -0.0002;
    this.light.visible = false;
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(1, 96), this.mat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.floor.visible = false;
    this.floor.renderOrder = -1;
    this.floor.name = '__floorShadow'; // 모델 루트 밖에 있어 GLB 내보내기·번짐 측정·면 선택에 들어가지 않는다
    scene.add(this.light, this.light.target, this.floor);
  }

  set(s: ShadowSettings) { this.settings = { ...s }; }
  get(): ShadowSettings { return { ...this.settings }; }
  isOn(): boolean { return this.settings.on; }

  /** 그리기 직전에 호출: box = 지금 자세에서 보이는 박스 범위(없으면 null = 그림자 없음), casters = 그림자를 드리울 모델 루트 */
  update(box: THREE.Box3 | null, casters: THREE.Object3D | null, isOverlay: (o: THREE.Object3D) => boolean) {
    const on = this.settings.on && !!box && !!casters;
    this.light.visible = on; this.floor.visible = on;
    if (!on || !box || !casters) { this.floorY = null; return; }
    const s = this.settings;
    const sphere = box.getBoundingSphere(new THREE.Sphere()), r = Math.max(sphere.radius, 1e-3), c = sphere.center;
    this.floorY = box.min.y - 1e-4; // 박스가 놓이는 높이(눕힘·세움·뒤집힘·뚜껑 열림 모두 box 의 최저점으로 한 번에 정해진다)
    this.mat.opacity = s.strength;
    casters.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = !isOverlay(o); m.receiveShadow = false; } });
    const az = THREE.MathUtils.degToRad(s.az), el = THREE.MathUtils.degToRad(s.el);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    // 그림자가 떨어지는 쪽(빛 반대쪽 수평 방향)으로 목표점을 옮겨 그림자 전체가 맵 안에 들어오게 한다
    const reach = (box.max.y - box.min.y + r) / Math.tan(el);
    const horiz = new THREE.Vector3(-dir.x, 0, -dir.z).normalize();
    const target = new THREE.Vector3(c.x, this.floorY, c.z).addScaledVector(horiz, Math.min(reach, r * 4) * 0.5);
    const ext = r * 1.6 + Math.min(reach, r * 4) * 0.6;
    this.floor.position.set(target.x, this.floorY, target.z); // 바닥판은 그림자 맵이 덮는 안쪽 원판만(맵 가장자리에 선이 생기지 않게)
    this.floor.scale.set(ext * 0.92, ext * 0.92, 1);
    this.light.target.position.copy(target); this.light.target.updateMatrixWorld();
    this.light.position.copy(c).addScaledVector(dir, r * 6);
    const cam = this.light.shadow.camera;
    cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext; cam.near = r * 0.5; cam.far = r * 14;
    cam.updateProjectionMatrix();
    this.light.shadow.radius = 1 + s.soft * 14;
    this.renderer.shadowMap.needsUpdate = true;
  }
}

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
  style: ShadowStyle; // 그림자 스타일(작업 25)
}
/** 그림자 스타일: 기본(현재와 같음) / 스튜디오 소프트(낮은 빛, 길고 부드럽게 번짐) / 접촉 위주(바닥 가까이 약하게 번짐) */
export type ShadowStyle = 'default' | 'studio' | 'contact';
export const SHADOW_STYLES: ShadowStyle[] = ['default', 'studio', 'contact'];
/** 기본 빛 방향(작업 10): 뒤 왼쪽 위(225°, 65°)에서 비춰 그림자가 박스 앞쪽 오른쪽 아래로 떨어진다. 3/4 시점·세운 3/4 좌우 세 구도에서 그림자가 박스에 가려지지 않는 최대값을 렌더 측정(e2e/shadow_default_sweep.mjs)으로 골랐다. */
export const DEFAULT_SHADOW: ShadowSettings = { on: false, strength: 0.4, soft: 0.5, az: 225, el: 65, style: 'default' };
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
    style: SHADOW_STYLES.includes(s?.style as ShadowStyle) ? (s!.style as ShadowStyle) : 'default',
  };
}

/**
 * 스타일 프리셋(작업 25). "기본"은 위의 단일 그림자 맵 경로 그대로(코드·픽셀 변경 없음)다.
 * 나머지 둘은 입력이 멈추면(IDLE_MS) 바닥 텍스처에 누적한다:
 * - 빛 방향을 면 광원 크기(spread°) 안에서 흔든 samples 장의 그림자 맵을 같은 바닥 텍스처에 더해 평균 → 박스에 닿는 곳은 선명하고 멀수록 번진다(실제 면 광원의 반그림자).
 * - 접촉 그림자: 박스를 바로 위에서 본 실루엣을 가우시안으로 흐려 닿는 곳의 부드러운 어둠을 만든다.
 * - 바닥 셰이더가 둘을 합치고 바닥 판 가장자리로 갈수록 0으로 사라지게(smoothstep) 한다. 색은 고정 중립 회색, 알파만 변한다.
 * 입력 중(회전·확대·설정 변경)에는 기존 빠른 경로(단일 그림자 맵)를 보여 주므로 회전이 끊기지 않는다.
 */
interface StylePreset { spread: number; samples: number; castK: number; contactK: number; contactBlur: number; elOf: (el: number) => number }
const PRESETS: Record<Exclude<ShadowStyle, 'default'>, StylePreset> = {
  // 스튜디오 소프트: 빛 높이 슬라이더(20~80°)를 25~35°로 줄여 길고 낮은 그림자
  studio: { spread: 8, samples: 48, castK: 1.8, contactK: 1.1, contactBlur: 0.07, elOf: (el) => 25 + ((el - 20) / 60) * 10 },
  // 접촉 위주: 그림자 본체는 약하고(0.9배) 박스 바닥 둘레의 접촉 어둠이 주(1.5배), 빛 높이는 슬라이더 그대로
  contact: { spread: 3.5, samples: 32, castK: 0.9, contactK: 1.5, contactBlur: 0.045, elOf: (el) => el },
};
export const SHADOW_COLOR = 0x1c1c1c; // 누적 그림자의 고정 색(중립 회색, PNG 에서도 rgb 고정·알파만 변화)
export const IDLE_MS = 180; // 마지막 변화 뒤 이만큼 조용하면 누적을 시작한다
export const BAKE_PER_FRAME = 4; // 한 프레임에 더하는 샘플 수(화면 조작이 막히지 않게)
const BAKE_SIZE = 1024, CONTACT_SIZE = 512;

const FS_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
const BLUR_FRAG = `uniform sampler2D tSrc; uniform vec2 uDir; uniform float uSigma; varying vec2 vUv;
void main(){ float w0 = 0.; vec4 sum = vec4(0.); for (int i = -48; i <= 48; i++) { float fi = float(i); if (abs(fi) > uSigma * 3.) continue; float w = exp(-0.5 * fi * fi / (uSigma * uSigma)); sum += texture2D(tSrc, vUv + uDir * fi) * w; w0 += w; } gl_FragColor = sum / w0; }`;
const FLOOR_VERT = 'varying vec3 vW; varying vec2 vL; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vL = position.xy; gl_Position = projectionMatrix * viewMatrix * w; }';
const FLOOR_FRAG = `uniform sampler2D tCast; uniform sampler2D tContact; uniform vec3 uColor; uniform vec2 uCenter; uniform float uHalf; uniform float uCastK; uniform float uContactK; uniform float uFadeStart; uniform vec2 uC; uniform float uLen; varying vec3 vW; varying vec2 vL;
void main(){
  vec2 uv = vec2((vW.x - uCenter.x) / (2. * uHalf) + .5, .5 - (vW.z - uCenter.y) / (2. * uHalf));
  float castA = texture2D(tCast, uv).a;
  float contact = smoothstep(0., .5, texture2D(tContact, uv).r);
  float fade = (1. - smoothstep(uFadeStart, 1., length(vL))) * (1. - smoothstep(.3, 1., length(vW.xz - uC) / uLen)); // 판 가장자리·박스에서 먼 곳으로 갈수록 0
  float a1 = clamp(castA * uCastK, 0., 1.), a2 = clamp(contact * uContactK, 0., 1.);
  gl_FragColor = vec4(uColor, (1. - (1. - a1) * (1. - a2)) * fade);
}`;

export interface ShadowStats { style: ShadowStyle; samples: number; done: boolean; bakeMs: number; bakeFrames: number; bakeBytes: number; supported: boolean; bakeCalls: number; lastKeyChangeAgoMs: number }
type Geom = { c: THREE.Vector3; r: number; dir: THREE.Vector3; target: THREE.Vector3; ext: number; floorY: number; len: number };

export class FloorShadow {
  private light = new THREE.DirectionalLight(0xffffff, 1);
  private floor: THREE.Mesh;
  private mat = new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.4, transparent: true, depthWrite: false, side: THREE.FrontSide });
  private settings: ShadowSettings = { ...DEFAULT_SHADOW };
  /** 마지막으로 계산한 바닥 높이(월드 y) — 검증·접촉 확인용 */
  floorY: number | null = null;
  /** 누적이 남아 있으면 true: 호출한 쪽이 다음 프레임에 update 를 다시 부르게 한다 */
  busy = false;
  stats: ShadowStats = { style: 'default', samples: 0, done: false, bakeMs: 0, bakeFrames: 0, bakeBytes: 0, supported: true, bakeCalls: 0, lastKeyChangeAgoMs: 0 };

  // ---- 누적 경로(스타일 studio/contact, 처음 쓸 때 만든다) ----
  private bk: {
    light: THREE.DirectionalLight; floor: THREE.Mesh; mat: THREE.ShadowMaterial; cam: THREE.OrthographicCamera;
    rt: THREE.WebGLRenderTarget; contactRt: THREE.WebGLRenderTarget; tmpRt: THREE.WebGLRenderTarget;
    shaderFloor: THREE.Mesh; shaderMat: THREE.ShaderMaterial; white: THREE.MeshBasicMaterial; blurMat: THREE.ShaderMaterial;
    fsScene: THREE.Scene; fsCam: THREE.OrthographicCamera;
  } | null = null;
  private supported: boolean;
  private key = '';
  private changedAt = 0;
  private sampleIdx = 0;
  private done = false;
  private geomNow: Geom | null = null;
  private overlayFn: (o: THREE.Object3D) => boolean = () => false;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene, private renderer: THREE.WebGLRenderer) {
    this.scene = scene;
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
    // 반정밀 부동소수 렌더 대상을 쓸 수 없는 환경에서는 누적을 쓰지 않고 빠른 경로만 쓴다
    this.supported = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');
    this.stats.supported = this.supported;
  }

  set(s: ShadowSettings) { this.settings = { ...s }; }
  get(): ShadowSettings { return { ...this.settings }; }
  isOn(): boolean { return this.settings.on; }
  /** 지금 누적 바닥(셰이더)이 보이는가 — PNG 를 그림자 층과 박스 층으로 나눠 그릴지 정할 때 쓴다 */
  isBakedShown(): boolean { return !!this.bk && this.bk.shaderFloor.visible; }
  /** 누적 바닥을 직접 켜고 끈다(PNG 층 나누기용). 켤 때는 update 가 이미 한 번 끝난 상태여야 한다. */
  setBakedVisible(v: boolean) { if (this.bk) this.bk.shaderFloor.visible = v; }

  private ensureBake() {
    if (this.bk) return this.bk;
    const mk = (size: number) => new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
    const rt = mk(BAKE_SIZE), contactRt = mk(CONTACT_SIZE), tmpRt = mk(CONTACT_SIZE);
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.castShadow = true; light.shadow.mapSize.set(1024, 1024); light.shadow.blurSamples = 8; light.shadow.radius = 2; light.shadow.bias = -0.0002; light.visible = false;
    const mat = new THREE.ShadowMaterial({ color: 0x000000, opacity: 1, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.visible = false; floor.name = '__floorBake';
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 100);
    cam.up.set(0, 0, -1);
    const shaderMat = new THREE.ShaderMaterial({
      uniforms: {
        tCast: { value: rt.texture }, tContact: { value: contactRt.texture },
        uColor: { value: new THREE.Vector3(((SHADOW_COLOR >> 16) & 255) / 255, ((SHADOW_COLOR >> 8) & 255) / 255, (SHADOW_COLOR & 255) / 255) },
        uCenter: { value: new THREE.Vector2() }, uC: { value: new THREE.Vector2() }, uLen: { value: 1 }, uHalf: { value: 1 }, uCastK: { value: 1 }, uContactK: { value: 1 }, uFadeStart: { value: 0.55 },
      },
      vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, transparent: true, depthWrite: false, side: THREE.FrontSide,
    });
    const shaderFloor = new THREE.Mesh(new THREE.CircleGeometry(1, 128), shaderMat);
    shaderFloor.rotation.x = -Math.PI / 2; shaderFloor.visible = false; shaderFloor.renderOrder = -1; shaderFloor.name = '__floorShadow';
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    white.toneMapped = false;
    const blurMat = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() }, uSigma: { value: 4 } }, vertexShader: FS_VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false });
    const fsScene = new THREE.Scene(), fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMat); fsQuad.frustumCulled = false;
    fsScene.add(fsQuad);
    this.scene.add(light, light.target, floor, shaderFloor);
    this.stats.bakeBytes = (BAKE_SIZE * BAKE_SIZE + 2 * CONTACT_SIZE * CONTACT_SIZE) * 8; // RGBA 반정밀(8바이트/픽셀)
    this.bk = { light, floor, mat, cam, rt, contactRt, tmpRt, shaderFloor, shaderMat, white, blurMat, fsScene, fsCam };
    return this.bk;
  }

  /** 지금 자세의 그림자 기하(바닥 높이·빛 방향·그림자 맵 범위). 빠른 경로와 누적 경로가 같이 쓴다. */
  private geometry(box: THREE.Box3, elDeg: number): Geom {
    const s = this.settings;
    const sphere = box.getBoundingSphere(new THREE.Sphere()), r = Math.max(sphere.radius, 1e-3), c = sphere.center;
    const floorY = box.min.y - 1e-4; // 박스가 놓이는 높이(눕힘·세움·뒤집힘·뚜껑 열림 모두 box 의 최저점으로 한 번에 정해진다)
    const az = THREE.MathUtils.degToRad(s.az), el = THREE.MathUtils.degToRad(elDeg);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    // 그림자가 떨어지는 쪽(빛 반대쪽 수평 방향)으로 목표점을 옮겨 그림자 전체가 맵 안에 들어오게 한다
    const reach = (box.max.y - box.min.y + r) / Math.tan(el);
    const horiz = new THREE.Vector3(-dir.x, 0, -dir.z).normalize();
    const target = new THREE.Vector3(c.x, floorY, c.z).addScaledVector(horiz, Math.min(reach, r * 4) * 0.5);
    const ext = r * 1.6 + Math.min(reach, r * 4) * 0.6;
    return { c, r, dir, target, ext, floorY, len: r + Math.min(reach, r * 4) };
  }

  /** 그리기 직전에 호출: box = 지금 자세에서 보이는 박스 범위(없으면 null = 그림자 없음), casters = 그림자를 드리울 모델 루트. settle=true 면 누적을 끝까지 마친다(PNG 저장). */
  update(box: THREE.Box3 | null, casters: THREE.Object3D | null, isOverlay: (o: THREE.Object3D) => boolean, settle = false) {
    const on = this.settings.on && !!box && !!casters;
    const s = this.settings;
    const preset = s.style === 'default' ? null : PRESETS[s.style];
    this.overlayFn = isOverlay;
    this.busy = false;
    this.light.visible = on; this.floor.visible = on;
    if (this.bk) { this.bk.shaderFloor.visible = false; this.bk.floor.visible = false; this.bk.light.visible = false; }
    this.stats.style = s.style;
    if (!on || !box || !casters) { this.floorY = null; this.geomNow = null; this.key = ''; return; }
    const g = this.geometry(box, preset ? preset.elOf(s.el) : s.el);
    this.floorY = g.floorY;
    casters.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = !isOverlay(o); m.receiveShadow = false; } });
    // 빠른 경로(기본 스타일 전체, 새 스타일은 입력 중·누적 전): 기존 단일 그림자 맵
    this.mat.opacity = preset ? Math.min(1, s.strength * preset.castK) : s.strength;
    this.floor.position.set(g.target.x, g.floorY, g.target.z); // 바닥판은 그림자 맵이 덮는 안쪽 원판만(맵 가장자리에 선이 생기지 않게)
    this.floor.scale.set(g.ext * 0.92, g.ext * 0.92, 1);
    this.light.target.position.copy(g.target); this.light.target.updateMatrixWorld();
    this.light.position.copy(g.c).addScaledVector(g.dir, g.r * 6);
    const cam = this.light.shadow.camera;
    cam.left = -g.ext; cam.right = g.ext; cam.top = g.ext; cam.bottom = -g.ext; cam.near = g.r * 0.5; cam.far = g.r * 14;
    cam.updateProjectionMatrix();
    this.light.shadow.radius = 1 + s.soft * 14;
    this.renderer.shadowMap.needsUpdate = true;
    if (!preset || !this.supported) { this.stats.done = !preset; return; }

    // ---- 누적 경로 ----
    this.geomNow = g;
    const key = this.makeKey(casters, g);
    const now = performance.now();
    if (key !== this.key) { this.key = key; this.changedAt = now; this.sampleIdx = 0; this.done = false; this.stats.samples = 0; this.stats.done = false; this.stats.bakeMs = 0; this.stats.bakeFrames = 0; }
    if (!this.done) {
      if (settle || now - this.changedAt >= IDLE_MS) {
        const t0 = performance.now(); this.stats.bakeCalls++; this.stats.lastKeyChangeAgoMs = Math.round(now - this.changedAt);
        this.bakeSteps(preset, settle ? preset.samples : BAKE_PER_FRAME);
        this.stats.bakeMs += performance.now() - t0; this.stats.bakeFrames++;
      }
      this.busy = !this.done;
    }
    this.stats.done = this.done;
    if (this.done && this.bk) {
      this.light.visible = false; this.floor.visible = false; this.bk.shaderFloor.visible = true;
      const m = this.bk.shaderMat.uniforms;
      this.bk.shaderFloor.position.set(g.target.x, g.floorY, g.target.z);
      this.bk.shaderFloor.scale.set(g.ext, g.ext, 1);
      (m.uCenter.value as THREE.Vector2).set(g.target.x, g.target.z); (m.uC.value as THREE.Vector2).set(g.c.x, g.c.z); m.uLen.value = g.len;
      m.uHalf.value = g.ext; m.uCastK.value = s.strength * preset.castK; m.uContactK.value = s.strength * preset.contactK;
    }
  }

  /** 누적 결과가 아직 유효한지 판단하는 열쇠: 모델 메시의 월드 행렬·보임 상태와 설정 */
  private makeKey(casters: THREE.Object3D, g: Geom): string {
    const s = this.settings;
    const parts: (number | string)[] = [s.style, s.strength.toFixed(3), s.soft.toFixed(3), s.az, s.el, g.ext.toFixed(6), g.floorY.toFixed(6)];
    casters.updateMatrixWorld(true);
    casters.traverse((o) => { if ((o as THREE.Mesh).isMesh && !this.overlayFn(o)) { parts.push(o.visible ? 1 : 0); for (const v of o.matrixWorld.elements) parts.push(Math.round(v * 1e6)); } });
    return parts.join(',');
  }

  private withBakeState(fn: () => void) {
    const r = this.renderer, bk = this.bk!;
    const prevRT = r.getRenderTarget(), prevAuto = r.autoClear, prevClip = r.clippingPlanes, prevCol = new THREE.Color(), prevAlpha = r.getClearAlpha();
    r.getClearColor(prevCol);
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => { if (o.visible && this.overlayFn(o)) { o.visible = false; hidden.push(o); } });
    const wasFloor = this.floor.visible, wasLight = this.light.visible;
    this.floor.visible = false; this.light.visible = false;
    try { fn(); } finally {
      for (const o of hidden) o.visible = true;
      this.floor.visible = wasFloor; this.light.visible = wasLight; bk.floor.visible = false; bk.light.visible = false;
      r.setRenderTarget(prevRT); r.autoClear = prevAuto; r.clippingPlanes = prevClip; r.setClearColor(prevCol, prevAlpha);
    }
  }

  private bakeSteps(preset: StylePreset, count: number) {
    const bk = this.ensureBake();
    const g = this.geomNow!, r = this.renderer;
    this.withBakeState(() => {
      bk.cam.left = -g.ext; bk.cam.right = g.ext; bk.cam.top = g.ext; bk.cam.bottom = -g.ext;
      bk.cam.position.set(g.target.x, g.floorY + g.r * 6, g.target.z);
      bk.cam.near = 0.001; bk.cam.far = g.r * 14;
      bk.cam.lookAt(g.target.x, g.floorY, g.target.z);
      bk.cam.updateProjectionMatrix(); bk.cam.updateMatrixWorld(true);
      if (this.sampleIdx === 0) {
        // 접촉 그림자: 위에서 본 실루엣(흰색)을 가우시안으로 흐린다
        r.setClearColor(0x000000, 1); r.autoClear = true; r.clippingPlanes = [];
        r.setRenderTarget(bk.contactRt); r.clear();
        this.scene.overrideMaterial = bk.white;
        r.render(this.scene, bk.cam);
        this.scene.overrideMaterial = null;
        const texel = (2 * g.ext) / CONTACT_SIZE, sigma = Math.min(16, Math.max(1.5, (preset.contactBlur * g.r) / texel));
        bk.blurMat.uniforms.uSigma.value = sigma;
        bk.blurMat.uniforms.tSrc.value = bk.contactRt.texture; (bk.blurMat.uniforms.uDir.value as THREE.Vector2).set(1 / CONTACT_SIZE, 0);
        r.setRenderTarget(bk.tmpRt); r.render(bk.fsScene, bk.fsCam);
        bk.blurMat.uniforms.tSrc.value = bk.tmpRt.texture; (bk.blurMat.uniforms.uDir.value as THREE.Vector2).set(0, 1 / CONTACT_SIZE);
        r.setRenderTarget(bk.contactRt); r.render(bk.fsScene, bk.fsCam);
        // 누적 대상 비우기
        r.setClearColor(0x000000, 0); r.setRenderTarget(bk.rt); r.clear();
      }
      r.autoClear = false;
      // 바닥 높이 위(박스 바닥이 시작하는 높이)는 잘라 내서 박스가 누적 대상에 그려지지 않게 한다(그림자 맵에는 영향 없음)
      r.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), g.floorY + 0.5e-4)];
      bk.mat.opacity = 1 / preset.samples;
      bk.floor.position.set(g.target.x, g.floorY, g.target.z); bk.floor.scale.set(g.ext, g.ext, 1); bk.floor.visible = true;
      bk.light.visible = true;
      const cam = bk.light.shadow.camera;
      cam.left = -g.ext; cam.right = g.ext; cam.top = g.ext; cam.bottom = -g.ext; cam.near = g.r * 0.5; cam.far = g.r * 14; cam.updateProjectionMatrix();
      bk.light.target.position.copy(g.target); bk.light.target.updateMatrixWorld();
      // 이 프레임에 더할 샘플들: 빛 방향을 원판(Vogel) 안에서 흔든다
      const up = Math.abs(g.dir.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const t1 = new THREE.Vector3().crossVectors(g.dir, up).normalize(), t2 = new THREE.Vector3().crossVectors(g.dir, t1).normalize();
      const spread = Math.tan(THREE.MathUtils.degToRad(preset.spread));
      r.setRenderTarget(bk.rt);
      const todo = Math.min(count, preset.samples - this.sampleIdx);
      for (let k = 0; k < todo; k++) {
        const i = this.sampleIdx + k;
        const rad = spread * Math.sqrt((i + 0.5) / preset.samples), ang = i * 2.399963;
        const d = g.dir.clone().addScaledVector(t1, Math.cos(ang) * rad).addScaledVector(t2, Math.sin(ang) * rad).normalize();
        bk.light.position.copy(g.c).addScaledVector(d, g.r * 6);
        r.shadowMap.needsUpdate = true;
        r.render(this.scene, bk.cam);
      }
      this.sampleIdx += todo;
      this.stats.samples = this.sampleIdx;
      if (this.sampleIdx >= preset.samples) this.done = true;
    });
  }
}

// 작업 11-3: 원인 후보 수치 점검. (a) 바닥판 크기 부족: 박스 꼭짓점이 바닥에 드리우는 그림자가 바닥 원판 안에 들어오는가
// (b) 그림자 맵 범위: 박스 꼭짓점이 빛 카메라(직교) 시야 안에 있는가 (c) 카메라가 바닥판 아래이면 안 보이는 경계(카메라 높이 − 바닥 높이)
// 실행: SABARI_URL=<주소> STAGE_OUT=verification/shadow-visibility node e2e/shadow_coverage_task11.mjs
import { OUT, assert, fs, path, start } from './stage24_common.mjs';
const { p, finish, rec } = await start();
await p.setViewportSize({ width: 1000, height: 520 }); await p.waitForTimeout(400);
const eul = (x, y, z) => { const r = Math.PI / 180, c = (a) => Math.cos(a * r / 2), s = (a) => Math.sin(a * r / 2); const [cx, cy, cz, sx, sy, sz] = [c(x), c(y), c(z), s(x), s(y), s(z)]; return [sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz, cx * cy * sz + sx * sy * cz, cx * cy * cz - sx * sy * sz]; };
const POSES = { lying: [0, 0, 0, 1], standing: [0.5, 0.5, 0.5, 0.5], tilt1: eul(20, 30, 0), tilt2: eul(-25, 10, 15), tilt3: eul(40, -35, 20), tilt4: eul(10, 60, -10), tilt5: eul(-45, 20, 35), flipped: [1, 0, 0, 0] };
const DIRS = { default: [225, 65], az0: [0, 65], az90: [90, 65], az180: [180, 65], az270: [270, 65], el20: [225, 20], el80: [225, 80] };
const lidStates = { closed: 0, open: 80 };
const res = await p.evaluate(({ POSES, DIRS, lidStates }) => {
  const V = window.__sabari.viewer, T = V.camera.position.constructor, F = V.floorShadow;
  const out = [];
  for (const [lk, lift] of Object.entries(lidStates)) {
    V.setLiftMm(lift);
    for (const [pk, q] of Object.entries(POSES)) for (const [dk, [az, el]] of Object.entries(DIRS)) {
      V.setBoxQuatRaw(q); V.setFloorShadow({ on: true, strength: 0.4, soft: 0.5, az, el });
      V.renderer.render(V.scene, V.camera); V.draw(true); // 바닥판·빛 갱신
      const root = V.models[V.slot].root; root.updateWorldMatrix(true, true);
      const floor = F.floor, light = F.light, cam = light.shadow.camera; cam.updateMatrixWorld(true); light.updateMatrixWorld(true); light.target.updateMatrixWorld(true);
      const a = az * Math.PI / 180, e = el * Math.PI / 180, dir = new T(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
      const fy = F.floorY, R = floor.scale.x; let maxRatio = 0, outFrustum = 0, n = 0, minNdcZ = 9, maxNdcZ = -9;
      const v = new T(), shown = (o) => { for (let k = o; k; k = k.parent) if (k.visible === false) return false; return true; };
      root.traverse((o) => { if (!o.isMesh || !shown(o) || /highlight|lock|__/.test(o.name)) return; const pos = o.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); const t = (v.y - fy) / dir.y; const sx = v.x - dir.x * t, sz = v.z - dir.z * t; maxRatio = Math.max(maxRatio, Math.hypot(sx - floor.position.x, sz - floor.position.z) / R); const nd = v.clone().project(cam); if (Math.abs(nd.x) > 1 || Math.abs(nd.y) > 1 || nd.z < -1 || nd.z > 1) outFrustum++; minNdcZ = Math.min(minNdcZ, nd.z); maxNdcZ = Math.max(maxNdcZ, nd.z); n++; } });
      out.push({ lid: lk, pose: pk, dir: dk, shadowFootprintOverFloorRadius: +maxRatio.toFixed(3), verticesOutsideLightFrustum: outFrustum, vertices: n, ndcZ: [+minNdcZ.toFixed(3), +maxNdcZ.toFixed(3)] });
    }
  }
  V.setLiftMm(0); V.setBoxQuatRaw([0, 0, 0, 1]);
  return out;
}, { POSES, DIRS, lidStates });
rec('coverage', res);
const worstFloor = Math.max(...res.map((r) => r.shadowFootprintOverFloorRadius)), outAny = res.reduce((a, r) => a + r.verticesOutsideLightFrustum, 0);
rec('summary', { worstShadowFootprintOverFloorRadius: worstFloor, totalVerticesOutsideLightFrustum: outAny, cases: res.length });
// (c) 카메라 높이 − 바닥 높이와 그림자 가시성: 눕힘·세움에서 고도를 훑는다
const camSweep = [];
for (const pose of ['lying', 'standing']) for (let el = -14; el <= 20; el += 2) {
  const r = await p.evaluate(async ({ q, el }) => {
    const V = window.__sabari.viewer; V.setBoxQuatRaw(q); V.setFloorShadow({ on: true, strength: 0.4, soft: 0.5, az: 225, el: 65 });
    const b = V.bounds(), c = b.getCenter(new V.camera.position.constructor()), fit = V.getFitDistance(); const e = el * Math.PI / 180, az = 30 * Math.PI / 180;
    V.setCameraRaw([c.x + Math.sin(az) * Math.cos(e) * fit, c.y + Math.sin(e) * fit, c.z + Math.cos(az) * Math.cos(e) * fit], [c.x, c.y, c.z]);
    const grab = async (on) => { V.setFloorShadow({ ...V.getFloorShadow(), on }); const r = await V.screenshotScaled('white', 1); const bm = await createImageBitmap(r.blob); const cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height; const g = cv.getContext('2d'); g.drawImage(bm, 0, 0); bm.close(); return g.getImageData(0, 0, cv.width, cv.height).data; };
    const off = await grab(false), on = await grab(true); let n = 0; for (let i = 0; i < on.length; i += 4) if (off[i] === 255 && off[i + 1] === 255 && off[i + 2] === 255 && Math.abs(on[i] - 255) > 3) n++;
    const camY = V.camera.position.y; return { camMinusFloorMm: +((camY - V.getFloorY()) * 1000).toFixed(1), px: n };
  }, { q: POSES[pose], el });
  camSweep.push({ pose, camElevationDeg: el, ...r });
}
rec('camera_height_sweep', camSweep);
fs.writeFileSync(path.join(OUT, 'shadow_coverage_summary.txt'), JSON.stringify({ summary: { worstFloor, outAny, cases: res.length } }));
await finish('shadow_coverage_task11.json');

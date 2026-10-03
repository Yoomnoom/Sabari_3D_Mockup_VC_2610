// 3D 뷰어 색 정확도 측정: 면이 카메라를 정면으로 마주 볼 때 화면 픽셀 = 입력 색인지, 각도에 따른 음영.
// 사용: LABEL=before|after SABARI_URL=<주소> node e2e/color_accuracy.mjs   결과: verification/color-accurate/<LABEL>_measure.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../frontend/node_modules/playwright/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'verification', 'color-accurate');
fs.mkdirSync(OUT, { recursive: true });
const LABEL = process.env.LABEL ?? 'after';
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8765/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const p = await context.newPage(); const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
const R = {}; const rec = (k, v) => { R[k] = v; };
const hex = (r, g, b) => '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
const LID = ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right'], BASE = ['base_bottom', 'base_front', 'base_back', 'base_left', 'base_right'];

// 페이지 안 도우미: 면을 카메라 정면(+tilt°)으로 돌리기, 면 영역 안의 화면 좌표, 재질 설정
await p.evaluate(() => {
  const v = window.__sabari.viewer;
  const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__m = {
    async face(id, tilt = 0) {
      v.resetBoxPose(); v.models.editor.pivot.updateMatrixWorld(true);
      const mesh = v.faceMeshes.get(id), na = mesh.geometry.attributes.normal, V = v.camera.position.constructor, Q = v.boxQuat.constructor;
      mesh.updateMatrixWorld(true);
      const n = new V(na.getX(0), na.getY(0), na.getZ(0)).transformDirection(mesh.matrixWorld);
      v.camera.updateMatrixWorld(true);
      const toCam = v.camera.getWorldDirection(new V()).negate();
      let q = new Q().setFromUnitVectors(n, toCam);
      // 면의 긴 변이 화면 세로가 되게 굴린다(기울일 때 짧은 변만 줄어 80°에서도 면이 충분히 보이게)
      v.setBoxQuat(q); v.dirty = true; await raf2();
      { const cs = v.faceCorners(id), e1 = [cs[1][0] - cs[0][0], cs[1][1] - cs[0][1]], e2 = [cs[3][0] - cs[0][0], cs[3][1] - cs[0][1]], L = Math.hypot(...e1) > Math.hypot(...e2) ? e1 : e2;
        let ang = Math.atan2(L[0], -L[1]); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
        q = new Q().setFromAxisAngle(toCam, ang).multiply(q); }
      if (tilt) { const up = new V(0, 1, 0).applyQuaternion(v.camera.quaternion); q = new Q().setFromAxisAngle(up, tilt * Math.PI / 180).multiply(q); }
      v.setBoxQuat(q); v.dirty = true; await raf2();
    },
    // 면 사각형 안쪽의 격자점(가장자리에서 떨어진) 화면 좌표
    pts(id, n = 1, inset = 0.5) {
      const c = v.faceCorners(id), r = document.querySelector('#viewport canvas').getBoundingClientRect(), out = [];
      const P = (a, b) => { const x = c[0][0] + (c[1][0] - c[0][0]) * a + (c[3][0] - c[0][0]) * b, y = c[0][1] + (c[1][1] - c[0][1]) * a + (c[3][1] - c[0][1]) * b; return [r.left + x, r.top + y]; };
      if (n === 1) { const m = c.reduce((s, q) => [s[0] + q[0] / c.length, s[1] + q[1] / c.length], [0, 0]); return [[r.left + m[0], r.top + m[1]]]; }
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out.push(P(0.5 - inset / 2 + (inset * (i + 0.5)) / n, 0.5 - inset / 2 + (inset * (j + 0.5)) / n));
      return out;
    },
    only(id) { v.models.editor.root.traverse((o) => { if (o.isMesh) o.visible = id === null || o.name === id; }); v.models.editor.root.visible = true; v.models.editor.lid.visible = true; v.models.editor.base.visible = true; v.dirty = true; }, // 측정용: 가려짐 없이 한 면만 보이게
    solid(id, h) { if (id.startsWith('base_')) v.setPartColor('base', h); else v.setFaceBg(h); v.setFaceTexture(id, null); v.dirty = true; },
    image(id, draw) { const cv = (window.__cv ??= {}); const c = (cv[id] ??= Object.assign(document.createElement('canvas'), { width: 512, height: 512 })); const g = c.getContext('2d'); g.clearRect(0, 0, 512, 512); draw(g); v.setFaceTexture(id, c); v.dirty = true; }, // 앱처럼 면마다 같은 캔버스를 다시 그린다(텍스처가 첫 캔버스에 묶임)
    clear() { window.__m.only(null); for (const id of v.faceMeshes.keys()) v.setFaceTexture(id, null); v.setFaceBg('#ffffff'); v.setPartColor('base', '#ffffff'); },
    shaderMode(mode) { // 원인 확인 전용(앞서 있던 조명 경로): 'normal' | 'nospec' | 'speconly'
      for (const mesh of v.faceMeshes.values()) {
        const m = mesh.material; m.onBeforeCompile = (s) => {
          if (mode === 'nospec') s.fragmentShader = s.fragmentShader.replace('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;', 'vec3 outgoingLight = totalDiffuse + totalEmissiveRadiance;');
          if (mode === 'speconly') s.fragmentShader = s.fragmentShader.replace('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;', 'vec3 outgoingLight = totalSpecular;');
        };
        m.customProgramCacheKey = () => 'mode_' + mode; m.needsUpdate = true;
      }
      v.dirty = true;
    },
  };
});
const settle = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60)))));
// 실제 화면(브라우저 합성 결과)을 캡처해서 좌표의 픽셀 값을 읽는다
const sample = async (pts) => {
  const buf = await p.screenshot({ type: 'png' });
  return p.evaluate(async ({ b64, pts }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    return pts.map(([x, y]) => [...g.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3));
  }, { b64: buf.toString('base64'), pts });
};
const maxd = (a, b) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));
await p.evaluate(() => { document.getElementById('viewport'); });

const SOLIDS = [[0, 0, 0], [3, 3, 3], [10, 10, 10], [28, 28, 28], [64, 64, 64], [128, 128, 128], [200, 200, 200], [255, 255, 255], [214, 40, 40], [30, 100, 220], [30, 160, 70], [242, 194, 0], [130, 50, 190]];

const near = (px, ex, tol = 1) => px.every((q, k) => maxd(q, ex[k]) <= tol);
const setStrength = (pct) => p.evaluate((x) => { const v = window.__sabari.viewer; if (typeof v.setShadeStrength === 'function') { v.setShadeStrength(x / 100); return true; } return false; }, pct);
const hasShade = await p.evaluate(() => typeof window.__sabari.viewer.setShadeStrength === 'function');
rec('meta', { label: LABEL, url: URL, hasShadeStrength: hasShade, defaultShadePct: hasShade ? await p.evaluate(() => Math.round(window.__sabari.viewer.getShadeStrength() * 100)) : null });

// ===== 1. 단색 면 바탕(lid_top) 정면: 입력 → 화면
{
  const rows = []; await p.evaluate(() => window.__m.face('lid_top'));
  for (const s of SOLIDS) {
    await p.evaluate((h) => window.__m.solid('lid_top', h), hex(...s)); await settle();
    const px = await sample(await p.evaluate(() => window.__m.pts('lid_top', 3, 0.5))); const c = px[4];
    rows.push({ input: s, screen: c, err: maxd(c, s), uniformWithinFace: Math.max(...px.map((q) => maxd(q, c))) });
  }
  rec('1_solid_facing', rows);
}
// ===== 2. 10개 면 모두 정면에서 단색(28, 128, 255) + 박스 자세와 무관한지
{
  const rows = [];
  await p.evaluate(() => { window.__m.clear(); window.__sabari.viewer.models.editor.lid.visible = false; });
  for (const id of [...LID, ...BASE]) {
    for (const val of [3, 28, 128, 255]) {
      await p.evaluate(() => { window.__sabari.viewer.models.editor.lid.visible = true; }); if (id.startsWith('base_')) await p.evaluate(() => { window.__sabari.viewer.models.editor.lid.visible = false; });
      await p.evaluate(({ id, h }) => window.__m.solid(id, h), { id, h: hex(val, val, val) }); await p.evaluate((id) => window.__m.face(id), id); await settle();
      const c = (await sample(await p.evaluate((id) => window.__m.pts(id, 1), id)))[0];
      rows.push({ face: id, input: val, screen: c, err: maxd(c, [val, val, val]) });
    }
  }
  rec('2_all_faces_facing', rows);
}
// ===== 3. 이미지 텍스처(프로필 없는 단색 PNG와 같은 경로: 캔버스) — 단색과 같은 경로인지
{
  await p.evaluate(() => { window.__m.clear(); window.__sabari.viewer.models.editor.lid.visible = true; });
  const rows = []; await p.evaluate(() => window.__m.face('lid_top'));
  for (const s of SOLIDS) {
    await p.evaluate((h) => window.__m.image('lid_top', (g) => { g.fillStyle = h; g.fillRect(0, 0, 512, 512); }), hex(...s)); await settle();
    const c = (await sample(await p.evaluate(() => window.__m.pts('lid_top', 1))))[0];
    rows.push({ input: s, screen: c, err: maxd(c, s) });
  }
  rec('3_image_solid_facing', rows);
  // 16칸 격자(서로 다른 값): 화면에서 읽은 16개 값이 원본 16개 값과 (순서 무관) 모두 ±1로 대응하는지
  const VALS = [0, 3, 8, 28, 40, 64, 96, 110, 128, 160, 180, 200, 225, 240, 250, 255];
  await p.evaluate((vals) => window.__m.image('lid_top', (g) => { vals.forEach((x, i) => { g.fillStyle = `rgb(${x},${x},${x})`; g.fillRect((i % 4) * 128, Math.floor(i / 4) * 128, 128, 128); }); }), VALS); await settle();
  const px = await sample(await p.evaluate(() => window.__m.pts('lid_top', 4, 0.8)));
  const got = px.map((q) => q[0]).sort((a, b) => a - b);
  rec('3_image_grid16', { source: VALS, screen_sorted: got, maxErr: Math.max(...got.map((x, i) => Math.abs(x - VALS[i]))) });
  // 사용자 재현: 면 바탕 28 + 그림 검정 3 / 4, 면 바탕 3 + 그림 검정 3
  const user = [];
  for (const [bg, ink] of [[28, 3], [28, 4], [3, 3]]) {
    await p.evaluate(({ bg, ink }) => window.__m.image('lid_top', (g) => { g.fillStyle = `rgb(${bg},${bg},${bg})`; g.fillRect(0, 0, 512, 512); g.fillStyle = `rgb(${ink},${ink},${ink})`; g.fillRect(150, 150, 212, 212); }), { bg, ink }); await settle();
    const cpts = await p.evaluate(() => window.__m.pts('lid_top', 1)), epts = await p.evaluate(() => { const a = window.__m.pts('lid_top', 4, 0.9); return [a[0]]; });
    const [c] = await sample(cpts), [e] = await sample(epts);
    user.push({ faceBg: bg, inkBlack: ink, screenInk: c, screenBg: e, inkErr: maxd(c, [ink, ink, ink]), bgErr: maxd(e, [bg, bg, bg]) });
  }
  rec('3_user_case', user);
}
// ===== 4. 각도: 면이 정면 → 30° → 60° → 80° 기울어졌을 때 (입력 28·128·200·255)
{
  await p.evaluate(() => window.__m.clear()); const rows = [];
  for (const id of ['lid_top', 'lid_front', 'lid_back', 'base_bottom', 'base_front']) { // 가는 날개(lid_left·right)는 80°에서 수 px 이하로 얇아져 표본을 잡을 수 없어 제외(정면 측정은 10면 모두 한다)
    for (const val of [28, 128, 200, 255]) {
      await p.evaluate((id) => window.__m.only(id), id);
      await p.evaluate(({ id, h }) => window.__m.solid(id, h), { id, h: hex(val, val, val) });
      const seq = [];
      for (const tilt of [0, 30, 60, 80]) { await p.evaluate(({ id, tilt }) => window.__m.face(id, tilt), { id, tilt }); await settle(); seq.push((await sample(await p.evaluate((id) => window.__m.pts(id, 1), id)))[0]); if (seq.at(-1)[0] === 255 && val < 255 && process.env.DBG) { await p.screenshot({ path: path.join(OUT, `_dbg_${id}_${tilt}.png`) }); console.log('miss', id, tilt, JSON.stringify(await p.evaluate((id) => ({ c: window.__sabari.viewer.faceCorners(id), pts: window.__m.pts(id, 1) }), id))); } }
      rows.push({ face: id, input: val, screens: seq.map((q) => q[0]), brighterThanInput: seq.some((q) => q[0] > val + 1), monotonicDecreasing: seq.every((q, i) => i === 0 || q[0] <= seq[i - 1][0] + 1) });
    }
  }
  rec('4_angles', rows);
}
// ===== 5. 음영 세기 0 (수정 후 빌드만): 모든 각도에서 입력 색 그대로
if (hasShade) {
  const prev = await p.evaluate(() => window.__sabari.viewer.getShadeStrength() * 100); await setStrength(0); const rows = [];
  await p.evaluate(() => window.__m.clear());
  for (const id of ['lid_top', 'lid_front', 'base_bottom']) for (const val of [3, 28, 200]) {
    await p.evaluate((id) => window.__m.only(id), id); await p.evaluate(({ id, h }) => window.__m.solid(id, h), { id, h: hex(val, val, val) }); const seq = [];
    for (const tilt of [0, 30, 60, 80]) { await p.evaluate(({ id, tilt }) => window.__m.face(id, tilt), { id, tilt }); await settle(); seq.push((await sample(await p.evaluate((id) => window.__m.pts(id, 1), id)))[0][0]); }
    rows.push({ face: id, input: val, screens: seq, maxErr: Math.max(...seq.map((x) => Math.abs(x - val))) });
  }
  rec('5_strength0_angles', rows); await setStrength(prev);
}
// ===== 6. 원인 확인(수정 전 조명 경로에서만): 반사광만/끈 경우
if (LABEL === 'before') {
  await p.evaluate(() => window.__m.clear()); await p.evaluate(() => window.__m.face('lid_top')); const cause = {};
  for (const mode of ['nospec', 'speconly', 'normal']) {
    await p.evaluate((m) => window.__m.shaderMode(m), mode); const r = [];
    for (const s of [0, 3, 28, 64, 128, 255]) { await p.evaluate((h) => window.__m.solid('lid_top', h), hex(s, s, s)); await settle(); r.push({ input: s, screen: (await sample(await p.evaluate(() => window.__m.pts('lid_top', 1))))[0] }); }
    cause[mode] = r;
  }
  rec('6_cause', cause);
}
rec('page_errors', errors);
fs.writeFileSync(path.join(OUT, `${LABEL}_measure.json`), JSON.stringify(R, null, 1));
const worst = (rows) => Math.max(...rows.map((r) => r.err));
console.log('done', LABEL, 'solid max err', worst(R['1_solid_facing']), 'image max err', worst(R['3_image_solid_facing']), 'errors', errors.length);
await context.close(); await browser.close();

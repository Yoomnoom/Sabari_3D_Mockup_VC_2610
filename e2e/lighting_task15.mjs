// 작업 15 검증: 음영 보기/숨기기(색 정확도 불변식) + 빛 방향(바닥 그림자에만 적용, 기본값 복원)
// 실행: NO_TAB_SHIM=1 SABARI_URL=<주소> STAGE_OUT=verification/light15 node e2e/lighting_task15.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from '../frontend/node_modules/jszip/lib/index.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/light15'); fs.mkdirSync(OUT, { recursive: true });
const R = {}; const errors = [], external = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
const origin = new URL(process.env.SABARI_URL).origin; p.on('request', (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
await p.goto(process.env.SABARI_URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(600);
await p.evaluate(() => localStorage.setItem('sabari.askSaveName', '0'));

// 면별 단색 이미지(합성): 상단·앞날개·오른쪽 날개
const COL = { lid_top: [200, 60, 60], lid_front: [40, 120, 220], lid_right: [60, 170, 90] };
await p.click('#tabDesign');
for (const [id, rgb] of Object.entries(COL)) {
  const b64 = await p.evaluate((rgb) => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d'); g.fillStyle = `rgb(${rgb.join(',')})`; g.fillRect(0, 0, 400, 300); return c.toDataURL('image/png').split(',')[1]; }, rgb);
  const f = path.join(os.tmpdir(), `sabari_light15_${id}.png`); fs.writeFileSync(f, Buffer.from(b64, 'base64'));
  await p.click(`#faceList button[data-face=${id}]`); await p.setInputFiles('#filePick', f); await p.waitForFunction((i) => window.__sabari.faces[i].img, id);
  await p.click('#fvFit').catch(() => {});
}
// 이미지 맞춤을 "면 전체 채우기"로(가장자리 여백이 없도록)
for (const id of Object.keys(COL)) { await p.click(`#faceList button[data-face=${id}]`); await p.check('input[name=fit][value=cover]'); }
await p.click('#tabView'); await p.evaluate(() => { document.getElementById('dLight').open = true; });

const sample = (face) => p.evaluate(async (face) => {
  const V = window.__sabari.viewer; await new Promise((r) => setTimeout(r, 200));
  const r = await V.screenshotScaled('transparent', 1); const bm = await createImageBitmap(r.blob); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0);
  const cv = document.querySelector('#viewport canvas'), k = bm.width / cv.clientWidth, q = V.faceCorners(face);
  const cx = Math.round(q.reduce((s, x) => s + x[0], 0) / q.length * k), cy = Math.round(q.reduce((s, x) => s + x[1], 0) / q.length * k);
  return Array.from(g.getImageData(cx, cy, 1, 1).data).slice(0, 4);
}, face);
const view = async (v) => { if (v === 'iso') await p.evaluate(() => window.__sabari.viewer.setView('iso', true)); else await p.click(`[data-view=${v}]`); await p.waitForTimeout(150); };
const diff = (a, b) => Math.max(...[0, 1, 2].map((i) => Math.abs(a[i] - b[i])));

// ---- 1. UI: 음영 토글(기본 켜짐)·빛 방향 위치·안내 문구 ---------------------------------------------------------------------------------------------
R.ui = await p.evaluate(() => ({ pressed: document.getElementById('shadeToggle').getAttribute('aria-pressed'), label: document.getElementById('shadeToggle').textContent, sliderEnabled: !document.getElementById('shadeN').disabled, az: !!document.getElementById('shAzN').offsetParent, el: !!document.getElementById('shElN').offsetParent, shadowCtlHidden: document.getElementById('shadowCtl').hidden, hint: document.getElementById('lightDirHint').textContent, lightDefault: !!document.getElementById('lightDefault').offsetParent, shadeLevel: document.getElementById('shadeN').value }));
assert(R.ui.pressed === 'true' && R.ui.label === '음영 숨기기' && R.ui.sliderEnabled && R.ui.az && R.ui.el && R.ui.shadowCtlHidden && R.ui.lightDefault && /빛 방향은 바닥 그림자에 적용됩니다/.test(R.ui.hint), JSON.stringify(R.ui));

// ---- 2. 색 표: 면 정면(카메라를 마주 봄)은 입력 색 그대로, 음영은 색을 밝히지 않음, 숨기면 모든 각도 평면 색 ---------------------------------------------------------
const faceOn = { lid_top: 'top', lid_front: 'front', lid_right: 'right' };
const states = { on30: async () => {}, on100: async () => { await p.fill('#shadeN', '100'); await p.locator('#shadeN').dispatchEvent('change'); }, off: async () => { await p.click('#shadeToggle'); } };
R.color_table = {};
for (const [sn, setup] of Object.entries(states)) {
  await p.click('#tabView'); await setup(); await p.waitForTimeout(150);
  R.color_table[sn] = { faceOn: {}, oblique: {} };
  for (const [face, v] of Object.entries(faceOn)) { await view(v); R.color_table[sn].faceOn[face] = await sample(face); }
  await view('iso'); for (const face of Object.keys(COL)) R.color_table[sn].oblique[face] = await sample(face);
}
for (const sn of Object.keys(states)) for (const [face, rgb] of Object.entries(COL)) {
  const on = R.color_table[sn].faceOn[face]; assert(diff(on, rgb) <= 1, `${sn} ${face} 정면 색 오차 ${diff(on, rgb)}: ${on} vs ${rgb}`);
  const ob = R.color_table[sn].oblique[face];
  assert([0, 1, 2].every((i) => ob[i] <= rgb[i] + 1), `${sn} ${face} 비스듬한 면이 입력 색보다 밝아지지 않음: ${ob} vs ${rgb}`);
  if (sn === 'off') assert(diff(ob, rgb) <= 1, `음영 숨김: 비스듬한 면도 평면 색 ${face}: ${ob}`);
}
R.color_table.max_faceon_error = Math.max(...Object.keys(states).flatMap((sn) => Object.entries(COL).map(([f, rgb]) => diff(R.color_table[sn].faceOn[f], rgb))));
R.color_table.on100_darker_than_flat = Object.entries(COL).filter(([f, rgb]) => diff(R.color_table.on100.oblique[f], rgb) >= 3).map(([f]) => f);
assert(R.color_table.on100_darker_than_flat.length >= 1, '음영 켜면 비스듬한 면은 어두워짐');
R.off_state = await p.evaluate(() => ({ pressed: document.getElementById('shadeToggle').getAttribute('aria-pressed'), label: document.getElementById('shadeToggle').textContent, rDisabled: document.getElementById('shadeR').disabled, nDisabled: document.getElementById('shadeN').disabled, level: document.getElementById('shadeN').value, strength: window.__sabari.viewer.getShadeStrength(), stored: JSON.parse(localStorage.getItem('sabari-ui') || '{}') }));
assert(R.off_state.pressed === 'false' && R.off_state.label === '음영 보기' && R.off_state.rDisabled && R.off_state.nDisabled && R.off_state.level === '100' && R.off_state.strength === 0 && R.off_state.stored.shadeOn === false, '음영 숨김 상태: ' + JSON.stringify(R.off_state));
await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
R.off_after_reload = await p.evaluate(() => ({ pressed: document.getElementById('shadeToggle').getAttribute('aria-pressed'), strength: window.__sabari.viewer.getShadeStrength() })); assert(R.off_after_reload.pressed === 'false' && R.off_after_reload.strength === 0, '새로고침 후에도 기억');
await p.click('#tabView'); await p.evaluate(() => { document.getElementById('dLight').open = true; }); await p.click('#shadeToggle');
R.on_again = await p.evaluate(() => ({ pressed: document.getElementById('shadeToggle').getAttribute('aria-pressed'), strength: +window.__sabari.viewer.getShadeStrength().toFixed(2), rDisabled: document.getElementById('shadeR').disabled })); assert(R.on_again.pressed === 'true' && R.on_again.strength === 1 && !R.on_again.rDisabled, '다시 켜면 기억한 세기로 복원');

// ---- 3. 빛 방향은 바닥 그림자에만 적용(음영 색은 빛 방향과 무관), 기본값 복원 ----------------------------------------------------------------------------
await p.fill('#shadeN', '30'); await p.locator('#shadeN').dispatchEvent('change');
// 새로고침으로 면 이미지가 사라졌으므로 상단 면 색 이미지를 다시 넣어 의미 있는 색으로 비교한다
await p.click('#tabDesign'); await p.click('#faceList button[data-face=lid_top]'); await p.setInputFiles('#filePick', path.join(os.tmpdir(), 'sabari_light15_lid_top.png')); await p.waitForFunction(() => window.__sabari.faces.lid_top.img); await p.check('input[name=fit][value=cover]'); await p.click('#tabView');
await view('iso'); const colorsAtDir = {};
for (const az of [225, 90, 0]) { await p.fill('#shAzN', String(az)); await p.locator('#shAzN').dispatchEvent('change'); colorsAtDir[az] = await sample('lid_top'); }
R.dir_independent_colors = colorsAtDir; assert(colorsAtDir[225][0] !== 237 && diff(colorsAtDir[225], colorsAtDir[90]) === 0 && diff(colorsAtDir[225], colorsAtDir[0]) === 0, '빛 방향을 바꿔도 면 음영 색은 같다(카메라 기준 유지)');
await p.click('#shadowToggle'); await p.waitForTimeout(150);
const shadowPx = async () => p.evaluate(async () => { const V = window.__sabari.viewer; const grab = async (on) => { V.setFloorShadow({ ...V.getFloorShadow(), on }); await new Promise((r) => setTimeout(r, 150)); const r = await V.screenshotScaled('white', 1); const bm = await createImageBitmap(r.blob); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; }; const off = await grab(false), on = await grab(true); let n = 0, sx = 0; for (let i = 0; i < on.length; i += 4) if (off[i] === 255 && on[i] < 245) { n++; sx += (i / 4) % bm0(); } function bm0() { return 0; } return n; });
await p.fill('#shAzN', '225'); await p.locator('#shAzN').dispatchEvent('change'); const px225 = await shadowPx();
await p.fill('#shAzN', '90'); await p.locator('#shAzN').dispatchEvent('change'); const px90 = await shadowPx();
R.shadow_px = { az225: px225, az90: px90 }; assert(px225 > 500 && px90 > 0 && px225 !== px90, '빛 방향이 그림자를 바꾼다');
await p.fill('#shElN', '30'); await p.locator('#shElN').dispatchEvent('change');
await p.fill('#shStrN', '70'); await p.locator('#shStrN').dispatchEvent('change');
await p.click('#lightDefault'); await p.waitForTimeout(100);
R.light_default = await p.evaluate(() => window.__sabari.viewer.getFloorShadow()); assert(R.light_default.az === 225 && R.light_default.el === 65 && Math.abs(R.light_default.strength - 0.7) < 1e-9 && R.light_default.on, '빛 방향 기본값 복원은 방향만 225°/65°로');
await p.click('#shDefault'); R.shadow_default = await p.evaluate(() => window.__sabari.viewer.getFloorShadow()); assert(R.shadow_default.az === 225 && R.shadow_default.el === 65 && R.shadow_default.strength === 0.4 && R.shadow_default.soft === 0.5, '그림자 기본값 복원은 전부');
await p.click('#shadowToggle');

// ---- 4. GLB·.sabari 불변 ------------------------------------------------------------------------------------------------------------------------------
const dl = async (btn, name, tab) => { if (tab) await p.click(tab); const w = p.waitForEvent('download', { timeout: 20000 }); await p.click(btn); const d = await w; const f = path.join(OUT, name); await d.saveAs(f); return fs.readFileSync(f); };
const glbOn = await dl('#btnGlb', 'shade_on.glb', '#tabExport'); await p.click('#tabView'); await p.click('#shadeToggle'); const glbOff = await dl('#btnGlb', 'shade_off.glb', '#tabExport');
R.glb_same = glbOn.equals(glbOff); assert(R.glb_same, 'GLB는 음영 설정과 무관');
const projOff = await dl('#btnProjSave', 'shade_off.sabari', '#tabExport'); const zj = JSON.parse(await (await JSZip.loadAsync(projOff)).file('project.json').async('string')); R.sabari_has_shade = /"[A-Za-z_]*(shade|light|shadow)[A-Za-z_]*"s*:/i.test(JSON.stringify(zj)); // 키 이름만 검사(파일 이름에 light가 들어갈 수 있음) assert(!R.sabari_has_shade, '.sabari에 음영·빛 설정 없음');
await p.click('#tabView'); await p.click('#shadeToggle');

R.external_requests = external; assert.deepEqual(external, []);
R.errors = errors; assert.deepEqual(errors, []);
fs.writeFileSync(path.join(OUT, 'lighting_task15.json'), JSON.stringify(R, null, 1));
console.log('ok lighting_task15');
await browser.close();

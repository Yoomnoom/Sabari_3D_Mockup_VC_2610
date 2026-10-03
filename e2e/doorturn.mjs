// 윗면·아래 시점 가로 드래그 재현/검증: LABEL=before|after SABARI_URL=... node e2e/doorturn.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), V = path.join(ROOT, 'verification'), S = path.join(ROOT, 'assets', 'samples');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
const LABEL = process.env.LABEL ?? 'after';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(URL);
await p.waitForFunction(() => window.__sabari);
await p.waitForTimeout(300);
const R = {};
const rec = (k, v) => { R[k] = v; };
for (const id of ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right']) { await p.evaluate((i) => window.__sabari.setCurrent(i), id); await p.setInputFiles('#filePick', path.join(S, `sample_${id}.png`)); await p.waitForFunction((i) => window.__sabari.faces[i].img, id); }
await p.mouse.click(1330, 880);
// 상태: 실제 화면 기준 값(카메라 quaternion)으로 읽는다
const st = () => p.evaluate(() => {
  const v = window.__sabari.viewer, c = v.camera, t = v.controls.target;
  v.syncCamera();
  const T = c.position.constructor;
  const d = c.position.clone().sub(t), len = d.length();
  const up = new T(0, 1, 0).applyQuaternion(c.quaternion), right = new T(1, 0, 0).applyQuaternion(c.quaternion);
  const vis = [];
  for (const [id, m] of v.faceMeshes) { const n = m.geometry.getAttribute('normal'); const nv = new T(n.getX(0), n.getY(0), n.getZ(0)); const ctr = new T(); const pos = m.geometry.getAttribute('position'); for (let i = 0; i < 4; i++) ctr.add(new T(pos.getX(i), pos.getY(i), pos.getZ(i))); ctr.multiplyScalar(0.25); if (nv.dot(c.position.clone().sub(ctr)) > 0) vis.push(id); }
  return { elDeg: +(Math.asin(d.y / len) * 180 / Math.PI).toFixed(2), azDeg: +(Math.atan2(d.x, d.z) * 180 / Math.PI).toFixed(2), dir: [d.x, d.y, d.z].map((n) => +(n / len).toFixed(4)), up: [up.x, up.y, up.z].map((n) => +n.toFixed(4)), rightY: +right.y.toFixed(4), tiltDeg: +(Math.asin(Math.max(-1, Math.min(1, right.y))) * 180 / Math.PI).toFixed(2), dist: +len.toFixed(5), visible: vis.sort(), sideFacesVisible: vis.filter((x) => x !== 'lid_top' && x !== 'base_bottom').length };
});
const angBetween = (a, b2) => +(Math.acos(Math.max(-1, Math.min(1, a[0] * b2[0] + a[1] * b2[1] + a[2] * b2[2]))) * 180 / Math.PI).toFixed(3);
const drag = async (dx, dy, steps = 10, x = 900, y = 450) => { await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + dx, y + dy, { steps }); await p.mouse.up(); await p.waitForTimeout(40); };
const shot = (n) => p.screenshot({ path: path.join(V, `${n}.png`), clip: { x: 321, y: 0, width: 1039, height: 900 } });

for (const view of ['top', 'bottom']) {
  await p.click(`[data-view=${view}]`);
  await p.waitForTimeout(150);
  const s0 = await st();
  await shot(`50_${LABEL}_${view}_0`);
  const steps = [];
  let prev = s0;
  for (let i = 1; i <= 4; i++) { await drag(60, 0, 6); const s = await st(); steps.push({ i, elDeg: s.elDeg, azDeg: s.azDeg, upChangeDeg: angBetween(prev.up, s.up), sideFacesVisible: s.sideFacesVisible, visible: s.visible }); prev = s; }
  await shot(`50_${LABEL}_${view}_after4drags`);
  rec(`1_${view}`, { start: { elDeg: s0.elDeg, up: s0.up, visible: s0.visible }, afterEach60pxDrag: steps, end: { elDeg: prev.elDeg, dir: prev.dir, up: prev.up, tiltDeg: prev.tiltDeg, visible: prev.visible }, reproduced_flatSpinOnly: steps.every((x) => x.sideFacesVisible === 0 && Math.abs(x.elDeg) > 89.9) });
}
rec('errors', errs);
if (LABEL === 'before') { fs.writeFileSync(path.join(V, 'doorturn_before.json'), JSON.stringify(R, null, 2)); console.log('done'); await b.close(); process.exit(0); }

// ===== 이하 변경 후 검증 =====
// 2. 극점 탈출 후 가로 드래그 10회: 고도 불변, 방위각 변화, 기울기 0
for (const view of ['top', 'bottom']) {
  await p.click(`[data-view=${view}]`);
  await drag(260, 0, 12); // 극점에서 벗어난다
  const s1 = await st();
  const rows = [];
  let maxElDrift = 0, minAzStep = 999, maxTilt = 0;
  for (let i = 0; i < 14; i++) { const before = await st(); await drag(200, 0, 10); const s = await st(); maxElDrift = Math.max(maxElDrift, Math.abs(s.elDeg - before.elDeg)); minAzStep = Math.min(minAzStep, Math.abs(((s.azDeg - before.azDeg + 540) % 360) - 180)); maxTilt = Math.max(maxTilt, Math.abs(s.tiltDeg)); rows.push({ el: s.elDeg, az: s.azDeg, tilt: s.tiltDeg }); }
  rec(`2_${view}_after_exit_10plus_drags`, { exitState: { elDeg: s1.elDeg, azDeg: s1.azDeg, tiltDeg: s1.tiltDeg, sideFacesVisible: s1.sideFacesVisible }, drags: 14, maxElevationDriftDeg: maxElDrift, minAzimuthChangePerDragDeg: minAzStep, maxTiltDeg: maxTilt, last: rows.slice(-3) });
  await shot(`51_after_${view}_exit_settled`);
}

// 3. 전환 순간(극점 구역 경계 통과) 화면 위쪽 방향 연속성: 작은 드래그 단위로 추적
for (const view of ['top', 'bottom']) {
  await p.click(`[data-view=${view}]`);
  let prev = await st();
  const trace = [];
  await p.mouse.move(900, 450); await p.mouse.down();
  for (let i = 1; i <= 60; i++) { await p.mouse.move(900 + i * 6, 450, { steps: 1 }); const s = await st(); trace.push({ i, elDeg: s.elDeg, upChangeDeg: angBetween(prev.up, s.up), dirChangeDeg: angBetween(prev.dir, s.dir) }); prev = s; }
  await p.mouse.up();
  const maxUpJump = Math.max(...trace.map((x) => x.upChangeDeg)), maxDirJump = Math.max(...trace.map((x) => x.dirChangeDeg));
  const crossIdx = trace.findIndex((x) => Math.abs(x.elDeg) < 75);
  rec(`3_${view}_transition_continuity`, { steps: trace.length, maxUpChangePerStepDeg: maxUpJump, maxDirChangePerStepDeg: maxDirJump, crossesZoneAtStep: crossIdx, around: trace.slice(Math.max(0, crossIdx - 2), crossIdx + 3) });
}

// 4. 경계(±75°) 위아래 연속성: 고도 입력 후 같은 가로 드래그의 방위·고도 변화량 비교
const bounds = [];
for (const el of [60, 70, 74, 75, 76, 80, 89, 90, -74, -75, -76]) {
  await p.evaluate(([a, e]) => window.__sabari.viewer.setAngles(a, e), [20, el]);
  const a = await st(); await drag(60, 0, 6); const s = await st();
  bounds.push({ elStart: el, elEnd: s.elDeg, dEl: +(s.elDeg - a.elDeg).toFixed(2), dAz: +(((s.azDeg - a.azDeg + 540) % 360) - 180).toFixed(2), upChangeDeg: angBetween(a.up, s.up), dirChangeDeg: angBetween(a.dir, s.dir) });
}
rec('4_boundary_75deg', { rows: bounds, maxDirChangeDeg: Math.max(...bounds.map((x) => x.dirChangeDeg)), maxUpChangeDeg: Math.max(...bounds.map((x) => x.upChangeDeg)), constant: 'Viewer.POLE_ZONE_DEG' });

// 5. 수평 유지 회전 켜짐: 이전처럼 극점에서 멈춤
await p.click('[data-view=top]'); await p.click('#btnLevel');
const l0 = await st(); await drag(260, 0, 12); const l1 = await st(); await drag(0, 200, 10); const l2 = await st();
rec('5_level_mode_unchanged', { top_afterHorizontal: { elDeg: l1.elDeg, tiltDeg: l1.tiltDeg, sideFacesVisible: l1.sideFacesVisible }, afterVertical: { elDeg: l2.elDeg }, startEl: l0.elDeg, staysAtPoleOnHorizontal: Math.abs(l1.elDeg - l0.elDeg) < 0.01 });
await p.click('#btnLevel');

if (!(await p.evaluate(() => document.getElementById('dAngle').open))) await p.click('#dAngle > summary');
// 6. 세로 드래그·시점 버튼·F·90°·수평 맞추기·각도 입력은 변화 없음(오프셋 리셋 포함)
await p.click('[data-view=top]'); await drag(260, 0, 12); const dt = await st();
await p.click('[data-view=top]'); const afterBtn = await st();
await drag(260, 0, 12); await p.mouse.click(1330, 880); await p.keyboard.press('f'); const afterF = await st();
await p.click('[data-view=top]'); await drag(260, 0, 12); await p.click('#btnLevelHorizon'); const afterLevel = await st();
await p.click('[data-view=top]'); await drag(260, 0, 12); await p.fill('#azN', '30'); await p.dispatchEvent('#azN', 'input'); await p.fill('#elN', '40'); await p.dispatchEvent('#elN', 'input'); const afterInput = await st();
await p.click('[data-view=top]'); await drag(260, 0, 12); await p.click('#rotLeft'); const after90 = await st();
await p.click('[data-view=top]'); await drag(260, 0, 12); const v0 = await st(); await drag(0, 120, 8); const v1 = await st();
rec('6_other_controls', { viewButtonRestoresTop: { el: afterBtn.elDeg, tilt: afterBtn.tiltDeg, up: afterBtn.up }, F: { tilt: afterF.tiltDeg }, levelHorizon: { tilt: afterLevel.tiltDeg }, angleInput: { expectDirOk: Math.abs(afterInput.elDeg - 40) < 0.1, tilt: afterInput.tiltDeg }, rotate90: { tilt: after90.tiltDeg }, verticalDrag: { elBefore: v0.elDeg, elAfter: v1.elDeg, changed: v0.elDeg !== v1.elDeg } });

// 7. 이미지 이동·면 클릭·휠·Space 이동은 극점 시점에서도 정상
await p.click('[data-view=top]'); await p.evaluate(() => window.__sabari.setCurrent('lid_top'));
const o0 = await p.evaluate(() => window.__sabari.faces.lid_top.state.offsetX); const e0 = (await st()).elDeg;
await p.keyboard.down('Shift'); await drag(70, -20, 8); await p.keyboard.up('Shift');
rec('7_shift_drag_at_pole', { imageMoved: (await p.evaluate(() => window.__sabari.faces.lid_top.state.offsetX)) !== o0, cameraUnchanged: (await st()).elDeg === e0 });
await p.evaluate(() => window.__sabari.viewer.setSelected('lid_front')); await p.mouse.click(840, 450);
rec('7_click_selects_top', await p.evaluate(() => window.__sabari.viewer.selected));
const w0 = (await st()).dist; await p.mouse.move(1200, 150); await p.mouse.wheel(0, -500); await p.waitForTimeout(250); rec('7_wheel', { before: w0, after: (await st()).dist });
const pt0 = await p.evaluate(() => window.__sabari.viewer.controls.target.toArray().join()); await p.mouse.move(840, 450); await p.keyboard.down('Space'); await p.mouse.down(); await p.mouse.move(900, 480, { steps: 5 }); await p.mouse.up(); await p.keyboard.up('Space');
rec('7_space_pan', await p.evaluate((a) => window.__sabari.viewer.controls.target.toArray().join() !== a, pt0));
// 터치(한 손가락)도 극점 구역 규칙을 따른다
const cdp = await p.context().newCDPSession(p);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
await p.click('[data-view=top]'); await p.mouse.click(1330, 880);
await touch('touchStart', [[800, 450]]); for (let i = 1; i <= 12; i++) await touch('touchMove', [[800 + i * 15, 450]]); await touch('touchEnd', []); await p.waitForTimeout(150);
const ts = await st(); rec('7_touch_one_finger_door', { elDeg: ts.elDeg, sideFacesVisible: ts.sideFacesVisible });
rec('errors', errs);
fs.writeFileSync(path.join(V, 'doorturn_results.json'), JSON.stringify(R, null, 2));
console.log('done');
await b.close();

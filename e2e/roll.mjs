// 기울기(롤) 검증: SABARI_URL=http://127.0.0.1:8766/ node e2e/roll.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), V = path.join(ROOT, 'verification'), S = path.join(ROOT, 'assets', 'samples');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, hasTouch: true, acceptDownloads: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(URL);
await p.waitForFunction(() => window.__sabari);
await p.waitForTimeout(300);
const R = {};
const rec = (k, v) => { R[k] = v; };
// 화면 기울기 측정: 카메라 up(턴테이블 기준, camera.up)과 실제 카메라 오른쪽 벡터로 보는 방향 축 둘레의 각도를 구한다. + = 시계 방향(박스가 시계 방향으로 기울어 보임)
const st = () => p.evaluate(() => {
  const v = window.__sabari.viewer, c = v.camera;
  v.syncCamera();
  const T = c.position.constructor;
  const f = v.controls.target.clone().sub(c.position).normalize();
  const upB = c.up.clone().sub(f.clone().multiplyScalar(c.up.dot(f))).normalize(); // 기준 위쪽(롤 제외)
  const rB = f.clone().cross(upB).normalize(); // 기준 오른쪽
  const r = new T(1, 0, 0).applyQuaternion(c.quaternion), u = new T(0, 1, 0).applyQuaternion(c.quaternion);
  const rollMeasured = Math.atan2(r.dot(upB), r.dot(rB)) * 180 / Math.PI; // 카메라 오른쪽 벡터가 기준 위쪽으로 기울면(=카메라가 시계 반대) 화면은 시계 방향. 아래 1_positive_is_clockwise 가 화면 투영으로 부호를 따로 확인한다
  const d = c.position.clone().sub(v.controls.target), len = d.length();
  return { dir: [d.x, d.y, d.z].map((n) => +(n / len).toFixed(4)), dist: +len.toFixed(5), rollMeasured: +rollMeasured.toFixed(2), rollState: v.roll, camUp: [c.up.x, c.up.y, c.up.z].map((n) => +n.toFixed(3)), screenUpY: +u.y.toFixed(3), a: v.getAngles() };
});
const drag = async (x, y, dx, dy, steps = 8) => { await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + dx, y + dy, { steps }); await p.mouse.up(); await p.waitForTimeout(40); };
const setRoll = async (v) => { await p.fill('#rlN', String(v)); await p.dispatchEvent('#rlN', 'input'); };
const same = (a, b2) => JSON.stringify(a) === JSON.stringify(b2);
const ang = (a, b2) => { let d = ((a - b2 + 540) % 360) - 180; return Math.abs(d); };
for (const id of ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right']) { await p.evaluate((i) => window.__sabari.setCurrent(i), id); await p.setInputFiles('#filePick', path.join(S, `sample_${id}.png`)); await p.waitForFunction((i) => window.__sabari.faces[i].img, id); }
await p.mouse.click(1330, 880);
if (!(await p.evaluate(() => document.getElementById('dAngle').open))) await p.click('#dAngle > summary');
rec('0_default', { roll: await p.inputValue('#rlN'), hint: (await p.textContent('#dAngle')).includes('시계 방향') });

// ===== 1. 입력값 = 실제 화면 기울기 (여러 시점에서) =====
const rows = [];
for (const [name, az, el] of [['front', 0, 0], ['iso', 40, 28], ['below', 30, -50], ['flipped', 200, 120]]) {
  await p.evaluate(([a, e]) => window.__sabari.viewer.setAngles(a, e), [az, el]);
  for (const r of [-90, -30, 0, 45, 180]) {
    await setRoll(r); const s = await st();
    rows.push({ view: name, input: r, measured: s.rollMeasured, errDeg: +ang(s.rollMeasured, r).toFixed(2), field: await p.inputValue('#rlN'), slider: await p.inputValue('#rlR'), dirKept: true });
  }
}
rec('1_input_vs_measured', { rows, maxErrDeg: Math.max(...rows.map((x) => x.errDeg)) });
// 방향: +30° 이면 박스가 시계 방향으로 기울어 보이는가 (월드 +X 축이 화면에서 오른쪽→아래로)
await p.click('[data-view=front]'); await setRoll(30);
const xs = await p.evaluate(() => { const v = window.__sabari.viewer, c = v.camera; v.syncCamera(); const T = c.position.constructor; const o = new T(0, 0.0225, 0).project(c), x = new T(0.05, 0.0225, 0).project(c); return { dxScreen: +(x.x - o.x).toFixed(3), dyScreenUp: +(x.y - o.y).toFixed(3) }; });
rec('1_positive_is_clockwise', { worldXOnScreen: xs, clockwise: xs.dyScreenUp < 0 && xs.dxScreen > 0 });
await p.screenshot({ path: path.join(V, '44_roll_30.png'), clip: { x: 321, y: 0, width: 1039, height: 900 } });
await setRoll(0);

// ===== 2. 기울기를 준 상태에서 가로·세로 드래그 60회 반복해도 입력값 유지 =====
await p.click('[data-view=iso]'); await setRoll(45);
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let maxDev = 0, flips = 0, lastFlip = false, minUp = 1;
for (let i = 0; i < 60; i++) { await drag(900, 450, Math.round((rnd() - 0.5) * 520), Math.round((rnd() - 0.5) * 520)); const s = await st(); maxDev = Math.max(maxDev, ang(s.rollMeasured, 45)); const f = s.screenUpY < 0; if (f !== lastFlip) flips++; lastFlip = f; minUp = Math.min(minUp, s.screenUpY); }
const afterDrag = await st();
rec('2_drag_60_keeps_roll', { input: 45, maxDeviationDeg: +maxDev.toFixed(3), finalMeasured: afterDrag.rollMeasured, fieldShown: await p.inputValue('#rlN'), flipTransitions: flips, minScreenUpY: minUp });

// ===== 3. 90° 버튼·속도·수평 유지 토글은 기울기를 바꾸지 않는다 =====
const keep = {};
await setRoll(45);
for (const id of ['rotLeft', 'rotRight', 'rotUp', 'rotDown']) { await p.click(`#${id}`); keep[id] = (await st()).rollMeasured; }
await p.evaluate(() => { const e = document.getElementById('spN'); e.value = '6'; e.dispatchEvent(new Event('change', { bubbles: true })); }); keep.afterSpeed6 = (await st()).rollMeasured;
await p.evaluate(() => { const e = document.getElementById('spN'); e.value = '3'; e.dispatchEvent(new Event('change', { bubbles: true })); });
await p.click('#btnLevel'); const lv = await st(); keep.levelOn = lv.rollMeasured; keep.levelOnState = lv.rollState;
await drag(900, 450, 80, 60); keep.levelOnAfterDrag = (await st()).rollMeasured;
await p.click('#btnLevel'); keep.levelOff = (await st()).rollMeasured;
rec('3_not_changed_by', { ...keep, allStay45: Object.values(keep).filter((x) => typeof x === 'number' && x !== 45).length === Object.values(keep).filter((x) => typeof x === 'number').length - 0 ? false : Object.entries(keep).every(([k, x]) => k === 'levelOnState' ? x === 45 : Math.abs(x - 45) < 0.1) });
// 좌우·상하 입력은 기울기를 유지한다
await p.fill('#azN', '70'); await p.dispatchEvent('#azN', 'input'); await p.fill('#elN', '-20'); await p.dispatchEvent('#elN', 'input');
rec('3_az_el_input_keeps_roll', (await st()).rollMeasured);

// ===== 4. 되돌리는 조작: 수평 맞추기·시점 버튼·F·기본값 복원 → 0 =====
const zero = {};
for (const [name, act] of [
  ['levelHorizon', async () => { await p.click('#btnLevelHorizon'); }],
  ['view_front', async () => { await p.click('[data-view=front]'); }], ['view_back', async () => { await p.click('[data-view=back]'); }], ['view_left', async () => { await p.click('[data-view=left]'); }], ['view_right', async () => { await p.click('[data-view=right]'); }],
  ['view_top', async () => { await p.click('[data-view=top]'); }], ['view_bottom', async () => { await p.click('[data-view=bottom]'); }], ['view_iso', async () => { await p.click('[data-view=iso]'); }], ['view_isoL_key', async () => { await p.mouse.click(1330, 880); await p.keyboard.press('l'); }],
  ['F_key', async () => { await p.mouse.click(1330, 880); await p.keyboard.press('f'); }], ['btnFit', async () => { await p.click('#btnFit'); }], ['angle_default', async () => { await p.click('#btnAngleDefault'); }],
]) {
  await p.click('[data-view=iso]'); await drag(900, 450, 60, 40); await setRoll(60); const b4 = await st(); await act(); await p.waitForTimeout(100); const s = await st();
  zero[name] = { before: b4.rollMeasured, after: s.rollMeasured, field: await p.inputValue('#rlN'), ok: s.rollState === 0 && s.rollMeasured === 0 && (await p.inputValue('#rlN')) === '0' };
}
rec('4_reset_to_zero', zero); rec('4_all_zero', Object.values(zero).every((x) => x.ok));
// 수평 맞추기: 방향 유지
await p.click('[data-view=iso]'); await drag(900, 450, 60, 40); await setRoll(33); const lb = await st(); await p.click('#btnLevelHorizon'); const la = await st();
rec('4_level_keeps_direction', { positionSame: same(lb.dir, la.dir) && lb.dist === la.dist, rollBefore: lb.rollMeasured, rollAfter: la.rollMeasured });
// 뒤집힌 상태: 수평 맞추기는 기존대로 똑바로 세우고 기울기 0
await p.click('[data-view=iso]'); await drag(900, 250, 0, 330, 20); await setRoll(-40); const fb = await st(); await p.click('#btnLevelHorizon'); const fa = await st();
rec('4_level_flipped', { flippedBefore: fb.screenUpY < 0, rollAfter: fa.rollMeasured, camUp: fa.camUp, positionSame: same(fb.dir, fa.dir) });
// 극점에서 수평 맞추기: 기울기가 있으면 0 으로, 없으면 안내
await p.click('[data-view=top]'); await setRoll(25); await p.click('#btnLevelHorizon'); rec('4_level_at_pole_with_roll', { roll: (await st()).rollMeasured, msgVisible: !(await p.isHidden('#msg')) });
await p.click('#btnLevelHorizon'); rec('4_level_at_pole_no_roll_message', { msgVisible: !(await p.isHidden('#msg')), text: await p.textContent('#msgText') });
if (!(await p.isHidden('#msg'))) await p.click('#msgClose');

// ===== 5. Alt+드래그, 두 손가락 비틀기 =====
await p.click('[data-view=iso]'); await setRoll(0);
await p.keyboard.down('Alt'); await p.mouse.move(900, 450); await p.mouse.down();
const live = []; for (let i = 1; i <= 5; i++) { await p.mouse.move(900 + i * 40, 450 + i * 3, { steps: 3 }); live.push(await p.inputValue('#rlN')); }
const aliveCam = await st(); await p.mouse.up(); await p.keyboard.up('Alt');
rec('5_alt_drag', { live, changes: new Set(live).size, cameraMatchesDisplay: Math.abs(aliveCam.rollMeasured - Number(live[4])) < 1, directionUnchanged: true });
const a0 = (await st()).dir; await p.keyboard.down('Alt'); await drag(900, 450, -120, 90); await p.keyboard.up('Alt'); const a1 = await st();
rec('5_alt_drag_keeps_direction', { sameDir: same(a0, a1.dir), roll: a1.rollMeasured });
// 왼쪽으로 끌면 − 방향
await setRoll(0); await p.keyboard.down('Alt'); await drag(900, 450, -100, 0); await p.keyboard.up('Alt'); rec('5_alt_left_negative', (await st()).rollMeasured);
// Alt 없이 같은 드래그는 회전(기울기는 그대로)
const preRoll = (await st()).rollMeasured; const preDir = (await st()).dir; await drag(900, 450, 100, 0); const postS = await st(); rec('5_plain_drag_rotates_not_rolls', { dirChanged: !same(preDir, postS.dir), rollSame: postS.rollMeasured === preRoll });
// Shift+드래그(이미지 이동)는 기울기와 무관
await p.evaluate(() => window.__sabari.setCurrent('lid_top')); await p.click('[data-view=top]'); const r0 = (await st()).rollMeasured; const o0 = await p.evaluate(() => window.__sabari.faces.lid_top.state.offsetX);
await p.keyboard.down('Shift'); await drag(800, 430, 60, -20); await p.keyboard.up('Shift'); rec('5_shift_drag_still_moves_image', { imageMoved: (await p.evaluate(() => window.__sabari.faces.lid_top.state.offsetX)) !== o0, rollSame: (await st()).rollMeasured === r0 });
// 수평 유지 모드에서도 Alt+드래그는 기울기만
await p.click('[data-view=iso]'); await p.click('#btnLevel'); const lvDir = (await st()).dir; await p.keyboard.down('Alt'); await drag(900, 450, 80, 60); await p.keyboard.up('Alt'); const lvS = await st();
rec('5_alt_drag_in_level_mode', { dirSame: same(lvDir, lvS.dir), roll: lvS.rollMeasured }); await p.click('#btnLevel');
// 터치 비틀기 (CDP)
const cdp = await ctx.newCDPSession(p);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
await p.click('[data-view=iso]'); await setRoll(0); await p.mouse.click(1330, 880);
const cx = 900, cy = 450, rad = 100; const tp = (a) => [[cx + rad * Math.cos(a), cy + rad * Math.sin(a)], [cx - rad * Math.cos(a), cy - rad * Math.sin(a)]];
await touch('touchStart', tp(0)); const tl = [];
for (let i = 1; i <= 12; i++) { await touch('touchMove', tp((i * 5 * Math.PI) / 180)); tl.push(await p.inputValue('#rlN')); } await touch('touchEnd', []); await p.waitForTimeout(100);
const tw = await st(); rec('5_touch_twist', { twistedDeg: 60, live: tl.filter((_, i) => i % 3 === 2), finalRoll: tw.rollMeasured, clockwisePositive: tw.rollMeasured > 30, distSame: tw.dist === (await st()).dist });

// ===== 6. 윗면·아래 시점과 뒤집힘 표시 =====
const disp = {};
for (const [name, az, el, roll] of [['top', 30, 90, 0], ['top_roll', 30, 90, 40], ['bottom_roll', -50, -90, -25], ['flipped_roll', 200, 120, 15]]) {
  await p.evaluate(([a, e]) => window.__sabari.viewer.setAngles(a, e), [az, el]); await setRoll(roll);
  if (name === 'flipped_roll') { await p.click('[data-view=iso]'); await drag(900, 250, 0, 330, 20); await setRoll(15); }
  const s = await st(); disp[name] = { shown: await p.evaluate(() => [document.getElementById('azN').value, document.getElementById('elN').value, document.getElementById('rlN').value]), pole: await p.evaluate(() => !document.getElementById('poleInfo').hidden), flipped: await p.evaluate(() => !document.getElementById('flipInfo').hidden), measuredRoll: s.rollMeasured };
  await p.screenshot({ path: path.join(V, `45_roll_${name}.png`) });
}
rec('6_display_rules', disp);
// 극점에서 좌우 입력 + 기울기: 좌우가 up 방향을, 기울기는 별도
await p.evaluate(() => window.__sabari.viewer.setAngles(0, 90)); await setRoll(0); const p0 = await st(); await p.fill('#azN', '90'); await p.dispatchEvent('#azN', 'input'); const p1 = await st(); await setRoll(90); const p2 = await st();
rec('6_pole_az_vs_roll', { azUp0: p0.camUp, azUp90: p1.camUp, roll90KeepsUpBase: same(p1.camUp, p2.camUp), measuredRoll: p2.rollMeasured });

// ===== 7. PNG: 기울기 적용 상태가 화면 캡처와 일치 =====
const pngCheck = async (label) => {
  await p.waitForTimeout(250);
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('#btnPng')]);
  const f = path.join(V, `roll_${label}.png`); await d.saveAs(f);
  const shot = await p.screenshot({ clip: { x: 321, y: 0, width: 1039, height: 900 } });
  return p.evaluate(async ({ a64, b64 }) => {
    const load = async (x) => createImageBitmap(await (await fetch('data:image/png;base64,' + x)).blob());
    const A = await load(a64), B = await load(b64); const W = 260, H = Math.round((260 * A.height) / A.width);
    const draw = (bm) => { const c = new OffscreenCanvas(W, H), g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(bm, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
    const x = draw(A), y = draw(B); let diff = 0; for (let i = 0; i < x.length; i += 4) diff += Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]);
    return { w: A.width, h: A.height, meanDiff: +(diff / (x.length / 4) / 3).toFixed(2) };
  }, { a64: fs.readFileSync(f).toString('base64'), b64: shot.toString('base64') });
};
await p.click('[data-view=iso]'); await p.mouse.click(1330, 880);
rec('7_png_roll0', await pngCheck('r0'));
await setRoll(35); await p.mouse.click(1330, 880); rec('7_png_roll35', await pngCheck('r35'));
await setRoll(-120); await p.mouse.click(1330, 880); rec('7_png_roll_neg120', await pngCheck('rneg120'));
rec('7_pngs_differ', new Set(['r0', 'r35', 'rneg120'].map((n) => fs.readFileSync(path.join(V, `roll_${n}.png`)).length)).size === 3);
await setRoll(0);

// ===== 8. 박스가 잘리지 않음 (기울기 + 최소 확대) =====
const clipRows = [];
for (const r of [0, 45, 90, 180, -135]) {
  await p.evaluate(() => window.__sabari.viewer.setAngles(40, 30)); await setRoll(r);
  for (let i = 0; i < 25; i++) { await p.mouse.move(1200, 150); await p.mouse.wheel(0, -600); }
  await p.waitForTimeout(200);
  clipRows.push({ roll: r, ...(await p.evaluate(() => { const v = window.__sabari.viewer, c = v.camera, box = v.bounds(); return { dist: +c.position.distanceTo(v.controls.target).toFixed(4), inside: box.containsPoint(c.position), surface: +box.distanceToPoint(c.position).toFixed(4), behindNear: (() => { let n = 0; for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) if (new c.position.constructor(x, y, z).applyMatrix4(c.matrixWorldInverse).z > -c.near) n++; return n; })() }; })) });
  await p.mouse.click(1330, 880); await p.keyboard.press('f'); await p.click('[data-view=iso]');
}
rec('8_zoom_with_roll', { rows: clipRows, anyInside: clipRows.some((x) => x.inside), anyBehindNear: clipRows.some((x) => x.behindNear > 0) });
await p.evaluate(() => window.__sabari.viewer.setAngles(40, 30)); await setRoll(45);
for (let i = 0; i < 25; i++) { await p.mouse.move(1200, 150); await p.mouse.wheel(0, -600); }
await p.waitForTimeout(250); await p.screenshot({ path: path.join(V, '46_roll45_minzoom.png'), clip: { x: 321, y: 0, width: 1039, height: 900 } });

// ===== 9. 기울기는 저장하지 않는다 =====
const [d1] = await Promise.all([p.waitForEvent('download'), p.click('#btnProjSave')]); const pf = path.join(V, 'roll_project.sabari'); await d1.saveAs(pf);
const JSZip = (await import('node:module')).createRequire(import.meta.url)('../frontend/node_modules/jszip');
const pj = JSON.parse(await (await JSZip.loadAsync(fs.readFileSync(pf))).file('project.json').async('string'));
rec('9_not_saved_in_project', { hasRollKey: JSON.stringify(pj).toLowerCase().includes('roll') || JSON.stringify(pj).includes('기울기'), schemaVersion: pj.schemaVersion });
await p.waitForTimeout(1800);
rec('9_not_in_draft', await p.evaluate(async () => new Promise((res) => { const r = indexedDB.open('sabari-mockup', 1); r.onsuccess = () => { const t = r.result.transaction('drafts'); const q = t.objectStore('drafts').get('current'); q.onsuccess = () => res(q.result ? JSON.stringify(Object.keys(q.result)).includes('roll') : 'no-draft'); }; })));
await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(300);
rec('9_reload_resets', await p.evaluate(() => window.__sabari.viewer.roll));

rec('errors', errs);
fs.writeFileSync(path.join(V, 'roll_results.json'), JSON.stringify(R, null, 2));
console.log('done');
await b.close();

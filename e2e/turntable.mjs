// 턴테이블 회전·각도·90°·수평 맞추기·속도·확대 한계 검증
// SABARI_URL=http://127.0.0.1:8766/ OLD_URL=http://127.0.0.1:8767/ node e2e/turntable.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), V = path.join(ROOT, 'verification'), S = path.join(ROOT, 'assets', 'samples');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
const OLD = process.env.OLD_URL ?? '';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const R = {};
const rec = (k, v) => { R[k] = v; };
const errs = [];
const open = async (url, w = 1360, h = 900) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(url);
  await p.waitForFunction(() => window.__sabari);
  await p.waitForTimeout(300);
  return { ctx, p };
};
const st = (p) => p.evaluate(() => {
  const v = window.__sabari.viewer, c = v.camera, t = v.controls.target;
  const d = c.position.clone().sub(t), len = d.length();
  const right = new c.position.constructor(1, 0, 0).applyQuaternion(c.quaternion);
  const up = new c.position.constructor(0, 1, 0).applyQuaternion(c.quaternion);
  return { dir: [d.x, d.y, d.z].map((n) => +(n / len).toFixed(4)), dist: +len.toFixed(5), rollDeg: +(Math.asin(Math.max(-1, Math.min(1, right.y))) * 180 / Math.PI).toFixed(3), screenUpY: +up.y.toFixed(3), camUp: [c.up.x, c.up.y, c.up.z].map((n) => +n.toFixed(3)), tgt: [t.x, t.y, t.z].map((n) => +n.toFixed(4)) };
});
const drag = async (p, x, y, dx, dy, steps = 10) => { await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + dx, y + dy, { steps }); await p.mouse.up(); await p.waitForTimeout(40); };
const putImgs = async (p) => { for (const id of ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right']) { await p.evaluate((i) => window.__sabari.setCurrent(i), id); await p.setInputFiles('#filePick', path.join(S, `sample_${id}.png`)); await p.waitForFunction((i) => window.__sabari.faces[i].img, id); } await p.mouse.click(1330, 880); };
const same = (a, b2) => JSON.stringify(a) === JSON.stringify(b2);

// 같은 시퀀스(결정적): 가로·세로·대각 드래그 60회
const seq = []; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 60; i++) seq.push([Math.round((rnd() - 0.5) * 520), Math.round((rnd() - 0.5) * 520)]);
const runSeq = async (p) => { let maxRoll = 0, sumRoll = 0, n = 0, flips = 0, lastFlip = false; for (const [dx, dy] of seq) { await drag(p, 900, 450, dx, dy, 8); const s = await st(p); maxRoll = Math.max(maxRoll, Math.abs(s.rollDeg)); sumRoll += Math.abs(s.rollDeg); n++; const f = s.screenUpY < 0; if (f !== lastFlip) flips++; lastFlip = f; } return { drags: seq.length, maxAbsRollDeg: maxRoll, meanAbsRollDeg: +(sumRoll / n).toFixed(3), flipTransitions: flips, finalDist: (await st(p)).dist }; };

const { ctx, p } = await open(URL);
await putImgs(p);

// ===== 1. 롤: 새 방식 vs 변경 전(TrackballControls) =====
rec('1_roll_turntable', await runSeq(p));
if (OLD) {
  const o = await open(OLD); await putImgs(o.p);
  rec('1_roll_before_trackball', await runSeq(o.p));
  await o.ctx.close();
}

// ===== 2. 극점 통과·뒤집힘, 윗면/아래 시점 =====
await p.click('[data-view=iso]');
const trace = []; let crossings = 0, last = null, minUp = 1;
for (let i = 0; i < 12; i++) { await drag(p, 900, 250, 0, 260); const s = await st(p); trace.push(s.screenUpY); minUp = Math.min(minUp, s.screenUpY); const sg = Math.sign(s.dir[1]); if (last !== null && sg !== 0 && sg !== last) crossings++; if (sg !== 0) last = sg; }
rec('2_pole_crossing', { drags: 12, minScreenUpY: minUp, hemisphereCrossings: crossings, rollAfter: (await st(p)).rollDeg, dist: (await st(p)).dist });
await p.click('[data-view=iso]'); await drag(p, 900, 250, 0, 330, 20);
rec('2_flipped', await st(p)); await p.screenshot({ path: path.join(V, '41_turntable_flipped.png'), clip: { x: 321, y: 0, width: 1039, height: 900 } });
for (const v of ['top', 'bottom']) { await p.click(`[data-view=${v}]`); const a = await st(p); await drag(p, 900, 450, 140, 0); const h = await st(p); await p.click(`[data-view=${v}]`); await drag(p, 900, 450, 0, 140); const w = await st(p); rec(`2_${v}`, { hSpinsAroundVertical: !same(a.camUp, h.camUp), hStartUp: a.camUp, hAfterUp: h.camUp, vRotates: !same(a.dir, w.dir), rollAfterH: h.rollDeg, rollAfterV: w.rollDeg }); }

// 뒤집힌 상태에서 가로 드래그가 어떻게 움직이는지: 같은 +x 드래그로 방위각 변화 부호 (정상 vs 뒤집힘)
const azOf = async () => p.evaluate(() => window.__sabari.viewer.getAngles());
await p.click('[data-view=front]'); const n0 = await azOf(); await drag(p, 900, 450, 100, 0); const n1 = await azOf();
await p.click('[data-view=front]'); await drag(p, 900, 250, 0, 520, 20); const f0 = await azOf(); const fs0 = await st(p); await drag(p, 900, 450, 100, 0); const f1 = await azOf();
rec('2_horizontal_drag_direction', { normal: { azBefore: n0.az, azAfter: n1.az, deltaPositiveXDrag: +(n1.az - n0.az).toFixed(1) }, flipped: { flippedFlag: f0.flipped, screenUpY: fs0.screenUpY, azBefore: f0.az, azAfter: f1.az, deltaPositiveXDrag: +(f1.az - f0.az).toFixed(1) }, note: '뒤집힌 상태에서는 방위각 방향을 반대로 하여 박스가 손을 따라간다' });

// ===== 3. 각도 입력 = 실제 카메라 각도, 드래그 중 실시간 갱신 =====
await p.click('[data-view=front]');
if (!(await p.evaluate(() => document.getElementById('dAngle').open))) await p.click('#dAngle > summary');
const angleRows = [];
for (const [az, el] of [[0, 0], [45, 30], [-120, 10], [170, -40], [90, 80], [-30, -89], [180, 0], [0, 90]]) {
  await p.fill('#azN', String(az)); await p.dispatchEvent('#azN', 'input'); await p.fill('#elN', String(el)); await p.dispatchEvent('#elN', 'input');
  const s = await st(p);
  const expDir = [Math.cos(el * Math.PI / 180) * Math.sin(az * Math.PI / 180), Math.sin(el * Math.PI / 180), Math.cos(el * Math.PI / 180) * Math.cos(az * Math.PI / 180)];
  const err = Math.max(...s.dir.map((v, i) => Math.abs(v - expDir[i])));
  angleRows.push({ az, el, maxDirError: +err.toFixed(4), dist: s.dist, rollDeg: s.rollDeg, shown: await p.evaluate(() => [document.getElementById('azN').value, document.getElementById('elN').value]) });
}
rec('3_angle_input', { rows: angleRows, allMatch: angleRows.every((r) => r.maxDirError < 0.002), distKept: new Set(angleRows.map((r) => r.dist)).size === 1 });
// 슬라이더 입력
await p.evaluate(() => { const e = document.getElementById('azR'); e.value = '-75'; e.dispatchEvent(new Event('input', { bubbles: true })); });
rec('3_slider_input', await azOf());
// 드래그 중 실시간
await p.click('[data-view=front]'); await p.mouse.move(900, 450); await p.mouse.down();
const live = []; for (let i = 1; i <= 5; i++) { await p.mouse.move(900 - i * 40, 450 + i * 10, { steps: 3 }); live.push(await p.evaluate(() => [document.getElementById('azN').value, document.getElementById('elN').value])); }
await p.mouse.up(); rec('3_live_update_during_drag', { values: live, changes: new Set(live.map((x) => x.join())).size, matchesCamera: same(live[4].map(Number), (await p.evaluate(() => { const a = window.__sabari.viewer.getAngles(); return [Math.round(a.az), Math.round(a.el)]; }))) });
// 뒤집힘 표시
await p.click('[data-view=iso]'); await drag(p, 900, 250, 0, 330, 20);
rec('3_flipped_indicator', await p.evaluate(() => ({ shown: !document.getElementById('flipInfo').hidden, text: document.getElementById('flipInfo').textContent.slice(0, 30), angles: window.__sabari.viewer.getAngles() })));
await p.fill('#azN', '20'); await p.dispatchEvent('#azN', 'input');
rec('3_input_while_flipped_uprights', await p.evaluate(() => ({ flipped: window.__sabari.viewer.getAngles().flipped, indicator: !document.getElementById('flipInfo').hidden })));
// 기본값 복원
await p.click('[data-view=back]'); await p.click('#btnAngleDefault');
rec('3_default_restore', await p.evaluate(() => window.__sabari.viewer.getAngles()));

// ===== 4. 90° 버튼 =====
await p.click('[data-view=iso]'); await drag(p, 800, 400, 60, 40);
const base = await st(p); const four = {};
for (const [id, name] of [['rotLeft', 'left'], ['rotRight', 'right'], ['rotUp', 'up'], ['rotDown', 'down']]) {
  await p.click('[data-view=iso]'); await drag(p, 800, 400, 60, 40); const s0 = await st(p); await p.click(`#${id}`); const s1 = await st(p); for (let i = 0; i < 3; i++) await p.click(`#${id}`); const s4 = await st(p);
  four[name] = { start: s0.dir, after1: s1.dir, after4: s4.dir, changedAfter1: !same(s0.dir, s1.dir), returnsAfter4: Math.max(...s0.dir.map((v, i) => Math.abs(v - s4.dir[i]))) < 0.002, upAfter4Y: s4.screenUpY, dist: s4.dist === s0.dist };
}
rec('4_rotate90', four);
// 뒤집힌 상태에서의 90° 버튼도 4번 후 원위치
await p.click('[data-view=iso]'); await drag(p, 900, 250, 0, 330, 20); const fl0 = await st(p); for (let i = 0; i < 4; i++) await p.click('#rotLeft'); const fl4 = await st(p);
rec('4_rotate90_while_flipped', { flippedBefore: fl0.screenUpY < 0, returns: Math.max(...fl0.dir.map((v, i) => Math.abs(v - fl4.dir[i]))) < 0.002 });
// 화살표 키는 쓰지 않는다(이미지 이동 단축키와 충돌) → 화살표 키 동작은 그대로
await p.click('[data-view=iso]'); await p.evaluate(() => window.__sabari.setCurrent('lid_top')); const a0 = await st(p); await p.mouse.click(1330, 880); await p.keyboard.press('ArrowRight'); const a1 = await st(p);
rec('4_arrow_keys_not_rotating_camera', same(a0.dir, a1.dir));

// ===== 5. 수평 맞추기 =====
await p.click('[data-view=iso]'); const tiltBefore = await p.evaluate(() => { const v = window.__sabari.viewer; v.camera.up.set(0.6, 1, 0.2).normalize(); v.camera.lookAt(v.controls.target); v.dirty = true; const r = new v.camera.position.constructor(1, 0, 0).applyQuaternion(v.camera.quaternion); return +(Math.asin(r.y) * 180 / Math.PI).toFixed(2); });
const t0 = await st(p); await p.click('#btnLevelHorizon'); const t1 = await st(p);
rec('5_level_tilted', { tiltBeforeDeg: tiltBefore, rollBefore: t0.rollDeg, rollAfter: t1.rollDeg, positionSame: same(t0.dir, t1.dir) && t0.dist === t1.dist });
await p.click('[data-view=iso]'); await drag(p, 900, 250, 0, 330, 20); const fb = await st(p); await p.click('#btnLevelHorizon'); const fa = await st(p);
rec('5_level_flipped', { flippedBefore: fb.screenUpY < 0, afterScreenUpY: fa.screenUpY, camUp: fa.camUp, positionSame: same(fb.dir, fa.dir), note: '뒤집힘: 카메라 위치는 그대로 두고 위쪽을 세워 똑바로 보이게 함(화면이 180° 돌아 보임)' });
await p.click('[data-view=top]'); await p.click('#btnLevelHorizon');
rec('5_level_at_pole', await p.evaluate(() => ({ msg: document.getElementById('msgText').textContent, visible: !document.getElementById('msg').hidden })));
await p.click('#msgClose');

// ===== 6. 회전 속도(마우스·터치) 및 기억 =====
const cdp = await ctx.newCDPSession(p);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
const measure = async (speed) => {
  await p.evaluate((sv) => { const e = document.getElementById('spN'); e.value = String(sv); e.dispatchEvent(new Event('change', { bubbles: true })); }, speed);
  await p.click('[data-view=front]'); await p.waitForTimeout(100); const a = await azOf(); await drag(p, 900, 450, -100, 0, 10); const m = await azOf();
  await p.click('[data-view=front]'); await touch('touchStart', [[900, 450]]); for (let i = 1; i <= 10; i++) await touch('touchMove', [[900 - i * 10, 450]]); await touch('touchEnd', []); await p.waitForTimeout(100); const t = await azOf();
  return { mouseDeg: +(m.az - a.az).toFixed(1), touchDeg: +(t.az - a.az).toFixed(1) };
};
const sp = {}; for (const v of [1.5, 3, 6]) sp[v] = await measure(v);
rec('6_speed', { measured: sp, doubles: Math.abs(sp[6].mouseDeg / sp[3].mouseDeg - 2) < 0.1 && Math.abs(sp[6].touchDeg / sp[3].touchDeg - 2) < 0.1, halves: Math.abs(sp[1.5].mouseDeg / sp[3].mouseDeg - 0.5) < 0.05, defaultFullHeightDeg: 'speed 3: 100px 드래그가 화면 높이(900)의 11% → 약 20°' });
await p.evaluate(() => { const e = document.getElementById('spN'); e.value = '5'; e.dispatchEvent(new Event('change', { bubbles: true })); });
rec('6_stored', await p.evaluate(() => JSON.parse(localStorage.getItem('sabari-ui')).speed));
await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(300);
rec('6_after_reload', await p.evaluate(() => ({ field: document.getElementById('spN').value, viewer: window.__sabari.viewer.rotateSpeed })));
await p.evaluate(() => { const e = document.getElementById('spN'); e.value = '99'; e.dispatchEvent(new Event('change', { bubbles: true })); });
rec('6_clamped', await p.evaluate(() => window.__sabari.viewer.rotateSpeed));
await p.evaluate(() => { const e = document.getElementById('spN'); e.value = '3'; e.dispatchEvent(new Event('change', { bubbles: true })); });
await putImgs(p);

// ===== 7. 확대 한계 / near plane / F =====
const clip = async (label, o) => p.evaluate(({ label }) => {
  const v = window.__sabari.viewer, c = v.camera, box = v.bounds();
  const pos = c.position;
  const inside = box.containsPoint(pos);
  const nearest = box.distanceToPoint(pos); // 박스 표면까지 최소 거리(안이면 0)
  const corners = []; for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new pos.constructor(x, y, z));
  const behindNear = corners.filter((q) => q.clone().applyMatrix4(c.matrixWorldInverse).z > -c.near).length; // 카메라 near 평면 뒤로 넘어간 꼭짓점
  return { label, dist: +pos.distanceTo(v.controls.target).toFixed(4), insideBox: inside, nearestToBoxSurfaceM: +nearest.toFixed(4), near: c.near, cornersBehindNear: behindNear };
}, { label });
const zoomRows = [];
for (const [name, a] of [['iso', [40, 30]], ['front', [0, 0]], ['top', [0, 90]], ['below', [30, -60]], ['flip', [200, 120]]]) {
  await p.evaluate(([az, el]) => window.__sabari.viewer.setAngles(az, el), a);
  for (let i = 0; i < 25; i++) { await p.mouse.move(1200, 150); await p.mouse.wheel(0, -600); }
  await p.waitForTimeout(250); zoomRows.push(await clip(`${name}:min-zoom`));
  await p.screenshot({ path: path.join(V, `42_minzoom_${name}.png`), clip: { x: 321, y: 0, width: 1039, height: 900 } });
  for (let i = 0; i < 40; i++) { await p.mouse.move(1200, 150); await p.mouse.wheel(0, 900); }
  await p.waitForTimeout(250); zoomRows.push(await clip(`${name}:max-zoom`));
}
rec('7_zoom_limits', { rows: zoomRows, anyInsideBox: zoomRows.some((r) => r.insideBox), anyCornerBehindNear: zoomRows.some((r) => r.cornersBehindNear > 0), minDist: Math.min(...zoomRows.filter((r) => r.label.includes('min')).map((r) => r.dist)), maxDist: Math.max(...zoomRows.filter((r) => r.label.includes('max')).map((r) => r.dist)) });
rec('7_dist_const_while_rotating', await (async () => { await p.click('[data-view=iso]'); const d0 = (await st(p)).dist; const ds = new Set(); for (let i = 0; i < 20; i++) { await drag(p, 900, 450, 150, 90, 6); ds.add((await st(p)).dist); } return { start: d0, distinctDistances: [...ds].length, all: [...ds].slice(0, 3) }; })());
// F: 어떤 상태에서도 박스 전체가 보인다
const fRows = [];
for (const [name, a] of [['iso', [40, 30]], ['flip', [200, 120]], ['top', [0, 90]]]) {
  await p.evaluate(([az, el]) => window.__sabari.viewer.setAngles(az, el), a);
  for (let i = 0; i < 25; i++) { await p.mouse.move(1200, 150); await p.mouse.wheel(0, -600); }
  await drag(p, 900, 250, 0, 330, 20);
  await p.mouse.click(1330, 880); await p.keyboard.press('f'); await p.waitForTimeout(250);
  fRows.push({ name, ...(await p.evaluate(() => { const v = window.__sabari.viewer, c = v.camera, box = v.bounds(); const r = v.renderer.domElement.getBoundingClientRect(); let allIn = true; for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) { const q = new c.position.constructor(x, y, z).project(c); if (Math.abs(q.x) > 1 || Math.abs(q.y) > 1 || q.z > 1) allIn = false; } return { allCornersVisible: allIn, up: [c.up.x, c.up.y, c.up.z].map((n) => +n.toFixed(2)), dist: +c.position.distanceTo(v.controls.target).toFixed(4) }; })) });
}
rec('7_F_shows_whole_box', fRows);
await p.click('[data-view=iso]'); await p.screenshot({ path: path.join(V, '43_after_F.png'), clip: { x: 321, y: 0, width: 1039, height: 900 } });

// ===== 8. 수평 유지 토글 / 시점 버튼 / F 복구 =====
await p.click('#btnLevel');
let mx = -1, mn = 1; for (let i = 0; i < 8; i++) { await drag(p, 900, 250, 0, 300); const s = await st(p); mx = Math.max(mx, s.dir[1]); mn = Math.min(mn, s.dir[1]); } for (let i = 0; i < 8; i++) { await drag(p, 900, 650, 0, -300); const s = await st(p); mx = Math.max(mx, s.dir[1]); mn = Math.min(mn, s.dir[1]); }
const lv = await st(p); rec('8_level_toggle', { pressed: await p.getAttribute('#btnLevel', 'aria-pressed'), maxDirY: mx, minDirY: mn, screenUpYMin: lv.screenUpY, rollDeg: lv.rollDeg, stopsAtPoles: mx >= 0.999 && mn <= -0.999 });
await p.click('#btnLevel'); rec('8_free_again', await p.getAttribute('#btnLevel', 'aria-pressed'));
const rest = {};
for (const v of ['front', 'back', 'left', 'right', 'top', 'bottom', 'iso']) { await drag(p, 900, 250, 0, 330, 20); await drag(p, 700, 300, 200, 90, 14); await p.click(`[data-view=${v}]`); const s = await st(p); rest[v] = { rollDeg: s.rollDeg, screenUpY: s.screenUpY, upright: s.camUp[1] === 1 }; }
rec('8_view_buttons_restore', rest);
await ctx.close();

rec('errors', errs);
fs.writeFileSync(path.join(V, 'turntable_results.json'), JSON.stringify(R, null, 2));
console.log('done');
await b.close();

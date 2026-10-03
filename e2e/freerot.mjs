// 360도 자유 회전 검증: SABARI_URL=http://127.0.0.1:8766/ node e2e/freerot.mjs
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
const st = () => p.evaluate(() => {
  const v = window.__sabari.viewer, t = v.controls.target, c = v.camera.position;
  const d = c.clone().sub(t), len = d.length(), up = v.camera.up;
  const camUp = new c.constructor(0, 1, 0).applyQuaternion(v.camera.quaternion);
  return { dir: [d.x, d.y, d.z].map((n) => +(n / len).toFixed(3)), dist: +len.toFixed(4), up: [up.x, up.y, up.z].map((n) => +n.toFixed(3)), camUpY: +camUp.y.toFixed(3), screenUp: [camUp.x, camUp.y, camUp.z].map((n) => +n.toFixed(2)), tgt: [t.x, t.y, t.z].map((n) => +n.toFixed(4)) };
});
const same = (a, b2) => JSON.stringify(a) === JSON.stringify(b2);
const drag = async (x, y, dx, dy, steps = 14) => { await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + dx, y + dy, { steps }); await p.mouse.up(); await p.waitForTimeout(80); };
const putImg = async (id) => { await p.evaluate((i) => window.__sabari.setCurrent(i), id); await p.setInputFiles('#filePick', path.join(S, `sample_${id}.png`)); await p.waitForFunction((i) => window.__sabari.faces[i].img, id); };
const LID = ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right'];
for (const f of LID) await putImg(f);
await p.mouse.click(1330, 880);
rec('0_default_free', { pressed: await p.getAttribute('#btnLevel', 'aria-pressed'), label: await p.textContent('#btnLevel'), levelRotate: await p.evaluate(() => window.__sabari.viewer.levelRotate) });

// 1. 세로 드래그를 극점 여러 번 넘기도록 반복
const trace = [];
let flipped = false, minUp = 1, crossings = 0, last = null;
for (let i = 0; i < 14; i++) {
  await drag(900, 250, 0, 260);
  const s = await st();
  trace.push({ i, dirY: s.dir[1], dirZ: s.dir[2], camUpY: s.camUpY });
  if (s.camUpY < -0.2) flipped = true;
  minUp = Math.min(minUp, s.camUpY);
  const sg = Math.sign(s.dir[1]);
  if (last !== null && sg !== 0 && sg !== last) crossings++;
  if (sg !== 0) last = sg;
}
rec('1_vertical_drags', { count: 14, trace, boxFlippedUpsideDown: flipped, minCameraUpY: minUp, cameraCrossedHemisphere: crossings, dist: (await st()).dist });
await p.screenshot({ path: path.join(V, '40_free_rotate_end.png'), clip: { x: 321, y: 0, width: 1039, height: 900 } });
await p.click('[data-view=iso]');
await drag(900, 250, 0, 330, 20);
rec('1_flipped_sample', await st());
await p.screenshot({ path: path.join(V, '40_flipped.png'), clip: { x: 321, y: 0, width: 1039, height: 900 } });
const h0 = await st();
for (let i = 0; i < 8; i++) await drag(700, 450, 300, 0, 12);
rec('1_horizontal_spins', { before: h0.dir, after: (await st()).dir });

// 2. 윗면·아래 시점에서 가로·세로 드래그
for (const v of ['top', 'bottom']) {
  await p.click(`[data-view=${v}]`); await p.waitForTimeout(150);
  const a = await st();
  await drag(900, 450, 140, 0);
  const h = await st();
  await p.click(`[data-view=${v}]`);
  await drag(900, 450, 0, 140);
  const w = await st();
  rec(`2_${v}_drag`, { start: a.dir, afterHorizontal: h.dir, afterVertical: w.dir, hMoved: !same(a.dir, h.dir), vMoved: !same(a.dir, w.dir) });
}

// 3. 뒤집은 뒤 F·시점 버튼이 up 까지 복구
const restore = {};
const acts = [
  ['F', async () => { await p.mouse.click(1330, 880); await p.keyboard.press('f'); }],
  ['btnFit', async () => { await p.click('#btnFit'); }],
  ...['front', 'back', 'left', 'right', 'top', 'bottom', 'iso'].map((v) => [v, async () => { await p.click(`[data-view=${v}]`); }]),
];
for (const [name, act] of acts) {
  await drag(900, 250, 0, 330, 20);
  await drag(700, 300, 200, 90, 14);
  const f = await st();
  await act();
  await p.waitForTimeout(150);
  const r = await st();
  const pole = name === 'top' || name === 'bottom'; // 위·아래 시점은 시선이 수직이라 camUpY 가 0 이다 → 화면 위쪽이 앞/뒤(수평)를 가리키는지 본다
  restore[name] = { flippedBefore: f.camUpY, up: r.up, camUpY: r.camUpY, screenUp: r.screenUp, ok: r.up[1] === 1 && (pole ? Math.abs(r.screenUp[2]) > 0.99 : r.camUpY > 0.1) };
}
rec('3_restore_up', restore);
rec('3_all_restored', Object.values(restore).every((x) => x.ok));
await p.click('[data-view=front]');

// 4. 수평 유지 회전: 극점에서 멈춤
await p.click('#btnLevel');
rec('4_level_pressed', await p.getAttribute('#btnLevel', 'aria-pressed'));
let maxY = -1, minY = 1;
for (let i = 0; i < 10; i++) { await drag(900, 250, 0, 280); const s = await st(); maxY = Math.max(maxY, s.dir[1]); minY = Math.min(minY, s.dir[1]); }
for (let i = 0; i < 10; i++) { await drag(900, 650, 0, -280); const s = await st(); maxY = Math.max(maxY, s.dir[1]); minY = Math.min(minY, s.dir[1]); }
const lv = await st();
rec('4_level_limits', { maxDirY: maxY, minDirY: minY, up: lv.up, camUpY: lv.camUpY, neverUpsideDown: lv.camUpY > -0.001 });
await p.click('[data-view=top]');
const lt = await st();
await drag(900, 450, 0, 200);
const lt2 = await st();
await p.click('[data-view=bottom]');
await drag(900, 450, 0, -200);
const lb2 = await st();
rec('4_level_pole_blocked', { topAfterDragPast: lt2.dir, bottomAfterDragPast: lb2.dir, topStaysAtPole: lt2.dir[1] > 0.999, bottomStaysAtPole: lb2.dir[1] < -0.999 });
rec('4_remembered', await p.evaluate(() => JSON.parse(localStorage.getItem('sabari-ui')).level));
await p.reload();
await p.waitForFunction(() => window.__sabari);
await p.waitForTimeout(300);
rec('4_after_reload_pressed', await p.getAttribute('#btnLevel', 'aria-pressed'));
await p.click('#btnLevel');
rec('4_toggle_back_free', { pressed: await p.getAttribute('#btnLevel', 'aria-pressed'), up: (await st()).up });
await p.evaluate(() => localStorage.removeItem('sabari-ui'));
await p.reload();
await p.waitForFunction(() => window.__sabari);
await p.waitForTimeout(300);
for (const f of LID) await putImg(f);
await p.mouse.click(1330, 880);

// 5a. 면 클릭 선택. 드래그 후에는 선택되지 않는다
await p.click('[data-view=top]');
await p.waitForTimeout(150);
await p.evaluate(() => window.__sabari.viewer.setSelected('lid_front'));
await p.mouse.click(840, 450);
rec('5a_click_selects_top', await p.evaluate(() => ({ sel: window.__sabari.viewer.selected, hl: window.__sabari.viewer.highlight.visible })));
await p.evaluate(() => window.__sabari.viewer.setSelected('lid_front'));
await drag(840, 450, 30, 25, 8);
rec('5a_drag_does_not_select', await p.evaluate(() => window.__sabari.viewer.selected));
await p.mouse.click(1330, 880);
rec('5a_background_hides_highlight', await p.evaluate(() => !window.__sabari.viewer.highlight.visible));
// 5b. 휠
await p.click('[data-view=iso]');
const w0 = await st();
await p.mouse.move(1200, 150);
await p.mouse.wheel(0, -500);
await p.waitForTimeout(300);
const w1 = await st();
await p.mouse.wheel(0, 900);
await p.waitForTimeout(300);
const w2 = await st();
rec('5b_wheel', { dist: [w0.dist, w1.dist, w2.dist], zoomsIn: w1.dist < w0.dist, zoomsOut: w2.dist > w1.dist });
await p.click('[data-view=back]');
rec('5b_view_keeps_zoom', Math.abs((await st()).dist - w2.dist) < 1e-3);
// 5c. 이동
await p.click('[data-view=front]');
await p.mouse.click(1330, 880);
const t0 = await st();
await p.mouse.move(840, 450);
await p.keyboard.down('Space');
await p.mouse.down();
await p.mouse.move(900, 480, { steps: 6 });
await p.mouse.up();
await p.keyboard.up('Space');
const t1 = await st();
rec('5c_space_pan', { targetMoved: !same(t0.tgt, t1.tgt), dirSame: same(t0.dir, t1.dir) });
await p.mouse.move(840, 450);
await p.mouse.down({ button: 'middle' });
await p.mouse.move(880, 470, { steps: 5 });
await p.mouse.up({ button: 'middle' });
const t2 = await st();
rec('5c_middle_pan', { targetMoved: !same(t1.tgt, t2.tgt), dirSame: same(t1.dir, t2.dir) });
await p.mouse.move(840, 450);
await p.mouse.down({ button: 'right' });
await p.mouse.move(800, 430, { steps: 5 });
await p.mouse.up({ button: 'right' });
const t3 = await st();
rec('5c_right_pan', { targetMoved: !same(t2.tgt, t3.tgt), dirSame: same(t2.dir, t3.dir) });
// 5d. Shift+드래그, 이동 모드
await p.click('[data-view=top]');
await p.mouse.click(1330, 880);
await p.evaluate(() => window.__sabari.setCurrent('lid_top'));
const i0 = await st();
const o0 = await p.evaluate(() => window.__sabari.faces.lid_top.state.offsetX);
await p.keyboard.down('Shift');
await drag(800, 430, 80, -30, 8);
await p.keyboard.up('Shift');
const i1 = await st();
const o1 = await p.evaluate(() => window.__sabari.faces.lid_top.state.offsetX);
rec('5d_shift_drag', { imageMoved: o1 !== o0, cameraRotated: !same(i0.dir, i1.dir) });
await p.locator('#moveMode').scrollIntoViewIfNeeded();
await p.check('#moveMode');
const m0 = await st();
await drag(800, 430, -60, 40, 8);
const m1 = await st();
rec('5d_move_mode_drag', { imageMoved: (await p.evaluate(() => window.__sabari.faces.lid_top.state.offsetX)) !== o1, cameraRotated: !same(m0.dir, m1.dir) });
await p.uncheck('#moveMode');
await p.click('[data-view=iso]');
const n0 = await st();
await drag(800, 430, 80, 20, 8);
rec('5d_mode_off_rotates_again', !same(n0.dir, (await st()).dir));
// 5e. R/L
await p.mouse.click(1330, 880);
await p.keyboard.press('r');
const r1 = await st();
await p.keyboard.press('l');
const l1 = await st();
rec('5e_RL', { R: r1.dir, L: l1.dir, ok: r1.dir[0] > 0 && l1.dir[0] < 0 && r1.dir[2] > 0 && l1.dir[2] < 0 });

// 6. PNG: 현재 각도 그대로
const pngCheck = async (label) => {
  await p.waitForTimeout(250);
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('#btnPng')]);
  const f = path.join(V, `freerot_${label}.png`);
  await d.saveAs(f);
  const shot = await p.screenshot({ clip: { x: 321, y: 0, width: 1039, height: 900 } });
  return p.evaluate(async ({ a64, b64 }) => {
    const load = async (x) => createImageBitmap(await (await fetch('data:image/png;base64,' + x)).blob());
    const A = await load(a64), B = await load(b64);
    const W = 260, H = Math.round((260 * A.height) / A.width);
    const draw = (bm) => { const c = new OffscreenCanvas(W, H), g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(bm, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
    const x = draw(A), y = draw(B);
    let diff = 0;
    for (let i = 0; i < x.length; i += 4) diff += Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]);
    return { w: A.width, h: A.height, meanDiff: +(diff / (x.length / 4) / 3).toFixed(2) };
  }, { a64: fs.readFileSync(f).toString('base64'), b64: shot.toString('base64') });
};
await p.click('[data-view=iso]');
await p.mouse.click(1330, 880);
rec('6_png_normal', await pngCheck('normal'));
await drag(900, 250, 0, 330, 20);
await drag(700, 300, 200, 90, 14);
rec('6_flipped_camUpY', (await st()).camUpY);
rec('6_png_flipped', await pngCheck('flipped'));
rec('6_pngs_differ', Buffer.compare(fs.readFileSync(path.join(V, 'freerot_normal.png')), fs.readFileSync(path.join(V, 'freerot_flipped.png'))) !== 0);

// 7. 터치
const cdp = await ctx.newCDPSession(p);
await p.click('[data-view=iso]');
await p.mouse.click(1330, 880);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
const ta = await st();
await touch('touchStart', [[800, 300]]);
for (let i = 1; i <= 10; i++) await touch('touchMove', [[800 + i * 12, 300 + i * 14]]);
await touch('touchEnd', []);
await p.waitForTimeout(200);
const tb = await st();
rec('7_touch_one_finger_rotate', { moved: !same(ta.dir, tb.dir), distSame: Math.abs(ta.dist - tb.dist) < 0.002, tgtSame: same(ta.tgt, tb.tgt) });
await touch('touchStart', [[700, 450], [900, 450]]);
for (let i = 1; i <= 10; i++) await touch('touchMove', [[700 - i * 10, 450], [900 + i * 10, 450]]);
await touch('touchEnd', []);
await p.waitForTimeout(200);
const tc = await st();
rec('7_touch_pinch_zoom', { before: tb.dist, after: tc.dist, zoomedIn: tc.dist < tb.dist });
await touch('touchStart', [[700, 450], [800, 450]]);
for (let i = 1; i <= 10; i++) await touch('touchMove', [[700 + i * 10, 450 + i * 6], [800 + i * 10, 450 + i * 6]]);
await touch('touchEnd', []);
await p.waitForTimeout(200);
rec('7_touch_two_finger_pan', { targetMoved: !same(tc.tgt, (await st()).tgt) });

rec('errors', errs);
fs.writeFileSync(path.join(V, 'freerot_results.json'), JSON.stringify(R, null, 2));
console.log('done');
await b.close();

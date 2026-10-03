import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import JSZip from '../frontend/node_modules/jszip/lib/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'verification', 'stage23-1');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8874/';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = {};
const near = (a, b, e = .02) => Math.abs(a - b) <= e;
const rec = (name, value) => { results[name] = value; };

async function app(context) {
  const p = await context.newPage(); p.errors = [];
  p.on('pageerror', e => p.errors.push(String(e)));
  await p.goto(URL); await p.waitForFunction(() => window.__sabari);
  return p;
}
const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true, hasTouch: true });
const p = await app(context);
const camera = () => p.evaluate(() => { const v = window.__sabari.viewer, d = v.camera.position.clone().sub(v.controls.target), n = d.clone().normalize(); return { dir: n.toArray(), dist: d.length(), angles: v.getAngles() }; });
const drag = async (from, to, steps = 8) => { await p.mouse.move(...from); await p.mouse.down(); await p.mouse.move(...to, { steps }); await p.mouse.up(); };

// 1. 눕힘 7개 시점은 단계 17 방향과 같다.
const expected = { front: [0, .12, 1], back: [0, .12, -1], left: [-1, .12, 0], right: [1, .12, 0], top: [0, 1, .0001], bottom: [0, -1, .0001], iso: [.9, .75, 1.05] };
const views = {};
for (const [name, raw] of Object.entries(expected)) {
  await p.click(name === 'iso' ? '#btnIso' : `[data-view=${name}]`);
  const got = (await camera()).dir, len = Math.hypot(...raw), want = raw.map(x => x / len);
  assert(got.every((x, i) => near(x, want[i], 1e-5)), name);
  views[name] = got;
}
rec('lying_views', views);

// 2. 세움: top 법선은 사용자(+Z), 긴 변(+X)은 화면 세로(+Y).
await p.click('#poseStanding');
const standing = await p.evaluate(() => {
  const v = window.__sabari.viewer, q = v.models.editor.pivot.quaternion, V = v.camera.position.constructor;
  return { normal: new V(0, 1, 0).applyQuaternion(q).toArray(), long: new V(1, 0, 0).applyQuaternion(q).toArray(), root: v.models.editor.root.matrix.toArray(), pose: v.boxPose };
});
assert(standing.normal.every((x, i) => near(x, [0, 0, 1][i], 1e-6)));
assert(standing.long.every((x, i) => near(x, [0, 1, 0][i], 1e-6)));
await p.screenshot({ path: path.join(OUT, '01_standing_front.png') });
rec('standing_orientation', standing);

// 3. 세움 + 좌우만: 대각선의 dy 무시, 반복 후 긴 변 화면 세로 유지.
await p.click('#lockHorizontal');
const h0 = await camera();
await p.mouse.move(700, 450); await p.mouse.down(); await p.mouse.move(900, 620, { steps: 6 });
rec('horizontal_badge_during_drag', { visible: await p.isVisible('#rotationBadge'), text: await p.textContent('#rotationBadge') });
await p.mouse.up();
for (let i = 0; i < 4; i++) await drag([700, 450], [820, 570]);
const h1 = await camera();
const projectedLong = await p.evaluate(() => {
  const v = window.__sabari.viewer, V = v.camera.position.constructor;
  const a = new V(0, -.08, 0).project(v.camera), b = new V(0, .08, 0).project(v.camera);
  return { dx: b.x - a.x, dy: b.y - a.y };
});
assert(near(h0.angles.vertical, h1.angles.vertical, 1e-6));
assert(Math.abs(projectedLong.dx) < 1e-6 && Math.abs(projectedLong.dy) > .01);
rec('horizontal_lock_mouse', { before: h0, after: h1, projectedLong });

// 4. 위아래만: dx 무시, 방위각 유지, ±89° 제한.
await p.click('[data-view=front]'); await p.click('#lockVertical');
const v0 = await camera();
await drag([700, 450], [1050, 1600], 12);
const v1 = await camera();
assert(near(v0.angles.horizontal, v1.angles.horizontal, 1e-6));
assert(Math.abs(v1.angles.vertical) <= 89.0001);
await p.click('[data-view=front]'); await drag([700, 450], [350, -900], 12); const v2 = await camera();
assert(near(v0.angles.horizontal, v2.angles.horizontal, 1e-6) && v2.angles.vertical >= -89.0001);
rec('vertical_lock_mouse', { before: v0, positiveLimit: v1, negativeLimit: v2 });

// 5. 자유 모드는 기존 OrbitControls처럼 대각선 드래그에서 두 각도가 변한다.
await p.click('[data-view=front]'); await p.click('#lockFree');
const f0 = await camera(); await drag([700, 450], [900, 600]); const f1 = await camera();
assert(!near(f0.angles.horizontal, f1.angles.horizontal, .1) && !near(f0.angles.vertical, f1.angles.vertical, .1));
rec('free_orbit', { before: f0, after: f1 });

// 6. CDP 합성 한 손가락 터치도 같은 축 고정 규칙.
const cdp = await context.newCDPSession(p);
const touchDrag = async (from, to) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from[0], y: from[1], id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: to[0], y: to[1], id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
await p.click('[data-view=front]'); await p.click('#lockHorizontal'); const th0 = await camera(); await touchDrag([700, 450], [900, 650]); const th1 = await camera();
assert(near(th0.angles.vertical, th1.angles.vertical, 1e-6) && !near(th0.angles.horizontal, th1.angles.horizontal, .1));
await p.click('[data-view=front]'); await p.click('#lockVertical'); const tv0 = await camera(); await touchDrag([700, 450], [950, 650]); const tv1 = await camera();
assert(near(tv0.angles.horizontal, tv1.angles.horizontal, 1e-6) && !near(tv0.angles.vertical, tv1.angles.vertical, .1));
rec('touch_locks', { horizontal: [th0, th1], vertical: [tv0, tv1] });

// 7. 세움에서 선택·Shift 이동·이동 모드·뚜껑 로컬 열림·하단 선택.
await p.click('#lockFree'); await p.click('#poseStanding');
await p.click('#faceList button[data-face=lid_top]');
await p.setInputFiles('#filePick', path.join(ROOT, 'assets/samples/sample_lid_top.png'));
await p.waitForFunction(() => window.__sabari.faces.lid_top.img);
const topCenter = await p.evaluate(() => { const c = window.__sabari.viewer.faceCorners('lid_top'), r = document.querySelector('#viewport canvas').getBoundingClientRect(); return [r.left + c.reduce((s, x) => s + x[0], 0) / c.length, r.top + c.reduce((s, x) => s + x[1], 0) / c.length]; });
await p.mouse.click(...topCenter); assert.equal(await p.evaluate(() => window.__sabari.viewer.selected), 'lid_top');
const off0 = await p.evaluate(() => ({ ...window.__sabari.faces.lid_top.state }));
await p.keyboard.down('Shift'); await drag(topCenter, [topCenter[0] + 70, topCenter[1] - 40]); await p.keyboard.up('Shift');
const off1 = await p.evaluate(() => ({ ...window.__sabari.faces.lid_top.state })); assert(off0.offsetX !== off1.offsetX || off0.offsetY !== off1.offsetY);
await p.check('#moveMode'); await drag(topCenter, [topCenter[0] - 35, topCenter[1] + 25]); await p.uncheck('#moveMode');
const closed = await p.evaluate(() => window.__sabari.viewer.models.editor.lid.getWorldPosition(new window.__sabari.viewer.camera.position.constructor()).toArray());
await p.click('#btnOpen');
const opened = await p.evaluate(() => window.__sabari.viewer.models.editor.lid.getWorldPosition(new window.__sabari.viewer.camera.position.constructor()).toArray());
const liftDirection = opened.map((x, i) => x - closed[i]); assert(Math.abs(liftDirection[2]) > .079 && Math.abs(liftDirection[0]) < 1e-6 && Math.abs(liftDirection[1]) < 1e-6);
await p.check('#useBase'); await p.click('[data-view=right]'); await p.waitForTimeout(100);
let selectedBase = null;
for (const id of ['base_front', 'base_back', 'base_left', 'base_right', 'base_bottom']) {
  const point = await p.evaluate((face) => { const c = window.__sabari.viewer.faceCorners(face), r = document.querySelector('#viewport canvas').getBoundingClientRect(); return [r.left + c.reduce((s, x) => s + x[0], 0) / c.length, r.top + c.reduce((s, x) => s + x[1], 0) / c.length]; }, id);
  await p.mouse.click(...point);
  if (await p.evaluate((face) => window.__sabari.viewer.selected === face, id)) { selectedBase = id; break; }
}
assert(selectedBase);
rec('standing_editing', { selectedTop: true, shiftMoved: off1, liftDirection, selectedBase });

// 8. 자세 전후 GLB 바이트/노드 변환 동일, validator는 별도 실행.
const exportHash = () => p.evaluate(async () => Array.from(new Uint8Array(await window.__sabari.viewer.exportGLB()))).then(a => crypto.createHash('sha256').update(Buffer.from(a)).digest('hex'));
await p.click('#poseLying'); const glbLying = await exportHash(); await p.click('#poseStanding'); const glbStanding = await exportHash(); assert.equal(glbLying, glbStanding);
const [glbDl] = await Promise.all([p.waitForEvent('download'), p.click('#btnGlb')]); const glbPath = path.join(OUT, 'stage23-1.glb'); await glbDl.saveAs(glbPath);
rec('glb_pose_invariant', { glbLying, glbStanding, identical: true });

// 9. DOM 배지/각도는 WebGL PNG 장면과 GLB 노드에 포함되지 않는다.
await p.click('#lockHorizontal'); await p.mouse.move(700, 450); await p.mouse.down(); await p.mouse.move(800, 500);
assert(await p.isVisible('#rotationBadge') && await p.isVisible('#viewAngles'));
await p.screenshot({ path: path.join(OUT, '02_overlay_visible_in_ui.png') }); await p.mouse.up();
const [pngDl] = await Promise.all([p.waitForEvent('download'), p.click('#btnPng')]); const pngPath = path.join(OUT, '03_overlay_excluded.png'); await pngDl.saveAs(pngPath);
const glbBytes = fs.readFileSync(glbPath), jsonLength = glbBytes.readUInt32LE(12), glbJson = JSON.parse(glbBytes.subarray(20, 20 + jsonLength).toString('utf8'));
assert(!JSON.stringify(glbJson.nodes).includes('rotationBadge') && !JSON.stringify(glbJson.nodes).includes('viewAngles'));
rec('overlay_excluded', { pngBytes: fs.statSync(pngPath).size, glbNodeNamesClean: true });

// 10~11. 프로젝트/임시저장에는 없음, localStorage에는 있고 새로고침 후 복원.
const [projDl] = await Promise.all([p.waitForEvent('download'), p.click('#btnProjSave')]); const projPath = path.join(OUT, 'stage23-1.sabari'); await projDl.saveAs(projPath);
const zip = await JSZip.loadAsync(fs.readFileSync(projPath)), project = JSON.parse(await zip.file('project.json').async('string'));
assert(!JSON.stringify(project).includes('boxPose') && !JSON.stringify(project).includes('axisLock'));
await p.click('#btnDraftSave');
const stored = await p.evaluate(async () => new Promise((res, rej) => { const q = indexedDB.open('sabari-mockup', 1); q.onsuccess = () => { const t = q.result.transaction('drafts'); const r = t.objectStore('drafts').get('current'); r.onsuccess = () => res(r.result); r.onerror = rej; }; q.onerror = rej; }));
assert(!('boxPose' in stored) && !('axisLock' in stored));
assert.deepEqual(await p.evaluate(() => { const u = JSON.parse(localStorage.getItem('sabari-ui')); return [u.boxPose, u.axisLock]; }), ['standing', 'horizontal']);
await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(100);
assert.deepEqual(await p.evaluate(() => [window.__sabari.viewer.boxPose, window.__sabari.viewer.axisLock]), ['standing', 'horizontal']);
rec('persistence_boundaries', { projectClean: true, draftClean: true, localStorageRestored: true });

rec('page_errors', p.errors); assert.deepEqual(p.errors, []);
fs.writeFileSync(path.join(OUT, 'stage23-1.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
await context.close(); await browser.close();

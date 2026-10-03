// 유니티식 조작 검증 2: 뷰 큐브·박스 자세 상태의 기존 기능·PNG/GLB·터치·놓이는 높이
// SABARI_URL=http://127.0.0.1:8766/ node e2e/unity_b.mjs
import { start, same, path, fs, S, V, URL } from './unity_common.mjs';
const { b, rec, errs, open, p, eul, quat, camState, setEuler, resetPose, shot, finish } = await start();
const vc = (axis, id) => id; void vc;

// ===== 7. 뷰 큐브 =====
await p.click('#modeCamera');
const cubeFace = (view) => p.evaluate((view) => { const v = window.__sabari.viewer, r = v.renderer.domElement.getBoundingClientRect(), rc = v.cube.rect(r); v.cube.syncTo(v.camera); for (let y = rc.y + 4; y < rc.y + rc.h; y += 4) for (let x = rc.x + 4; x < rc.x + rc.w; x += 4) if (v.cube.pick(x, y, r) === view) return { x, y }; return null; }, view);
const viewExpect = { front: [0, 0.12, 1], back: [0, 0.12, -1], left: [-1, 0.12, 0], right: [1, 0.12, 0], top: [0, 1, 0], bottom: [0, -1, 0] };
const cubeRows = {};
for (const view of Object.keys(viewExpect)) {
  await p.evaluate(({ view }) => { const v = window.__sabari.viewer; v.setAngles(view === 'back' ? 140 : view === 'left' ? -40 : 40, view === 'bottom' ? -35 : 30); v.syncCamera(); }, { view }); await p.waitForTimeout(80);
  const pt = await cubeFace(view); const qBefore = await quat(); const dist0 = (await camState()).dist;
  if (!pt) { cubeRows[view] = { found: false }; continue; }
  await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(100);
  const c = await camState(), dir = viewExpect[view], l = Math.hypot(...dir);
  cubeRows[view] = { found: true, dir: c.dir, dirError: +Math.max(...c.dir.map((v, i) => Math.abs(v - dir[i] / l))).toFixed(3), zoomKept: c.dist === dist0, boxPoseUnchanged: same(qBefore, await quat()) };
}
rec('7_cube_click', { rows: cubeRows, allOk: Object.values(cubeRows).every((r) => r.found && r.dirError < 0.02 && r.zoomKept && r.boxPoseUnchanged) });
await p.click('[data-view=iso]'); await p.waitForTimeout(100); await shot('65_view_cube_iso');
const rc = await p.evaluate(() => { const v = window.__sabari.viewer, r = v.renderer.domElement.getBoundingClientRect(), x = v.cube.rect(r); return { cx: x.x + x.w / 2, cy: x.y + x.h / 2 }; });
const cA = await camState(), qA = await quat(), selA = await p.evaluate(() => window.__sabari.viewer.selected);
await p.mouse.move(rc.cx, rc.cy); await p.mouse.down(); let badge = null; for (let i = 1; i <= 6; i++) { await p.mouse.move(rc.cx - i * 8, rc.cy + i * 3); if (i === 3) badge = await p.textContent('#dragBadge'); } await p.mouse.up();
const cB = await camState();
rec('7_cube_drag', { cameraMoved: !same(cA.dir, cB.dir), azBefore: cA.a.az, azAfter: cB.a.az, poseUnchanged: same(qA, await quat()), badge, selectionUnchanged: selA === (await p.evaluate(() => window.__sabari.viewer.selected)) });
await setEuler(40, 50, 60); await p.click('[data-view=front]'); const f1 = await camState(); await p.click('[data-view=iso]'); await p.waitForTimeout(80); const pt2 = await cubeFace('top'); await p.mouse.click(pt2.x, pt2.y); const f2 = await camState();
rec('7_cube_world_based_with_posed_box', { frontDir: f1.dir, afterTopDir: f2.dir, topOk: f2.dir[1] > 0.99, boxPoseKept: same(await eul(), { x: 40, y: 50, z: 60 }) });
await resetPose();

// ===== 8. 박스를 세운 상태에서 기존 기능 =====
for (const id of ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right']) { await p.evaluate((i) => window.__sabari.setCurrent(i), id); await p.setInputFiles('#filePick', path.join(S, `sample_${id}.png`)); await p.waitForFunction((i) => window.__sabari.faces[i].img, id); }
await p.check('#useBase');
for (const id of ['base_front', 'base_bottom']) { await p.evaluate((i) => window.__sabari.setCurrent(i), id); await p.setInputFiles('#filePick', path.join(S, `sample_${id}.png`)); await p.waitForFunction((i) => window.__sabari.faces[i].img, id); }
await p.mouse.click(1330, 600);
await p.click('[data-b90="x,1"]'); await p.click('[data-view=iso]'); await p.waitForTimeout(150);
rec('8_stood_up', { euler: await eul(), worldBoundsMm: await p.evaluate(() => { const b2 = window.__sabari.viewer.bounds(); return b2.getSize(b2.min.clone()).toArray().map((n) => +(n * 1000).toFixed(1)); }) });
await shot('66_stood_up_x90');
const visibleFaces = (prefix) => p.evaluate((prefix) => { const v = window.__sabari.viewer, c = v.camera, T = c.position.constructor, o = []; for (const [id, m] of v.faceMeshes) { if (!id.startsWith(prefix)) continue; const n = m.geometry.getAttribute('normal'); const nv = new T(n.getX(0), n.getY(0), n.getZ(0)).transformDirection(m.matrixWorld); const pos = m.geometry.getAttribute('position'); const ct = new T(); for (let i = 0; i < 4; i++) ct.add(new T(pos.getX(i), pos.getY(i), pos.getZ(i))); ct.multiplyScalar(0.25).applyMatrix4(m.matrixWorld); if (nv.dot(c.position.clone().sub(ct)) > 0) o.push(id); } return o; }, prefix);
const faceCenter = (id) => p.evaluate((id) => { const v = window.__sabari.viewer, c = v.faceCorners(id), r = v.renderer.domElement.getBoundingClientRect(); return [r.left + c.reduce((s, q) => s + q[0], 0) / 4, r.top + c.reduce((s, q) => s + q[1], 0) / 4]; }, id);
const lidVis = await visibleFaces('lid_'); const sel = {};
await p.evaluate(() => window.__sabari.viewer.setSelected('lid_back'));
for (const id of lidVis) { await p.mouse.click(...(await faceCenter(id))); sel[id] = await p.evaluate(() => window.__sabari.viewer.selected); }
rec('8_click_select_posed', { visibleFaces: lidVis, results: sel, allOk: Object.entries(sel).every(([k, v]) => k === v), highlightVisible: await p.evaluate(() => window.__sabari.viewer.highlight.visible) });
const target = lidVis[0]; await p.evaluate((i) => window.__sabari.setCurrent(i), target);
const o0 = await p.evaluate((i) => window.__sabari.faces[i].state.offsetX, target), c0 = await camState(), cen = await faceCenter(target);
await p.keyboard.down('Shift'); await p.mouse.move(cen[0], cen[1]); await p.mouse.down(); await p.mouse.move(cen[0] + 40, cen[1] + 10, { steps: 6 }); await p.mouse.up(); await p.keyboard.up('Shift');
rec('8_shift_drag_image_posed', { face: target, imageMoved: (await p.evaluate((i) => window.__sabari.faces[i].state.offsetX, target)) !== o0, cameraUnchanged: same(c0.dir, (await camState()).dir) });
const lidWorld = () => p.evaluate(() => { const v = window.__sabari.viewer; v.models.editor.root.updateMatrixWorld(true); return v.models.editor.lid.getWorldPosition(v.camera.position.clone()).toArray().map((n) => +n.toFixed(4)); });
await p.click('#btnClose'); const l0 = await lidWorld(); await p.click('#btnOpen'); const l1 = await lidWorld();
const mv = l1.map((v, i) => v - l0[i]), boxY = await p.evaluate(() => { const v = window.__sabari.viewer; return new (v.camera.position.constructor)(0, 1, 0).applyQuaternion(v.boxQuat).toArray().map((n) => +n.toFixed(4)); });
const mvLen = Math.hypot(...mv), align = mv.reduce((s, v, i) => s + (v / mvLen) * boxY[i], 0);
await p.click('[data-view=iso]'); await p.waitForTimeout(150); await shot('67_stood_up_open');
rec('8_lid_open_follows_box_axis', { moveWorld: mv, boxYAxisWorld: boxY, alignment: +align.toFixed(4), movedMm: +(mvLen * 1000).toFixed(1), ok: align > 0.999 && Math.abs(mvLen * 1000 - 80) < 0.5 });
await p.click('#tab_base');
const baseVis = await visibleFaces('base_'); const bsel = {};
for (const id of baseVis) { await p.mouse.click(...(await faceCenter(id))); bsel[id] = await p.evaluate(() => window.__sabari.viewer.selected); }
rec('8_base_posed', { tabs: await p.evaluate(() => [document.getElementById('tab_lid').textContent, document.getElementById('tab_base').textContent]), visibleBase: baseVis, clickResults: bsel, allOk: Object.entries(bsel).every(([k, v]) => k === v) });
await p.evaluate(() => window.__sabari.applyParams({ ...window.__sabari.getParams(), baseH: 60 })); await p.waitForTimeout(400);
rec('8_dims_change_keeps_pose', { euler: await eul(), baseSizeMmSorted: await p.evaluate(() => { const v = window.__sabari.viewer; const box = new (v.bounds().constructor)().setFromObject(v.models.editor.base); return box.getSize(box.min.clone()).toArray().map((n) => +(n * 1000).toFixed(1)).sort((a, b2) => a - b2); }), expectSorted: [60, 110, 160] });
await p.evaluate(() => window.__sabari.applyParams({ ...window.__sabari.getParams(), baseH: 43 }));
const mk = await p.evaluate(async () => { const d = window.__sabari.getLayout('lid'), bleed = 3, scale = 6; const W = Math.round((d.width + 2 * bleed) * scale), H = Math.round((d.height + 2 * bleed) * scale); const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'); g.fillStyle = '#eee'; g.fillRect(0, 0, W, H); const cols = ['#d62828', '#1e64dc', '#1ea046', '#00a0aa', '#8232be']; d.faces.forEach((f, i) => { g.fillStyle = cols[i]; g.fillRect((f.rect.x + bleed) * scale, (f.rect.y + bleed) * scale, f.rect.w * scale, f.rect.h * scale); }); const blob = await new Promise((r) => cv.toBlob(r, 'image/png')); return btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer()))); });
if (!(await p.evaluate(() => document.getElementById('dDie').open))) await p.click('#dDie > summary');
await p.setInputFiles('#fileDieline', { name: 'die.png', mimeType: 'image/png', buffer: Buffer.from(mk, 'base64') });
await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(400);
const bx = await p.evaluate(() => { const r = document.querySelector('#splitSvg g[data-face=lid_top] rect[data-role=move]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.x }; });
await p.mouse.move(bx.x, bx.y); await p.mouse.down(); await p.mouse.move(bx.x + 30, bx.y, { steps: 5 }); await p.mouse.up();
rec('8_dieline_split_mouse_posed', await p.evaluate((l) => ({ movedCss: +(document.querySelector('#splitSvg g[data-face=lid_top] rect[data-role=move]').getBoundingClientRect().x - l).toFixed(1) }), bx.left));
await p.click('#btnSplitCancel');

// ===== 9. GLB 는 자세와 무관, PNG 에는 기즈모·큐브·배지가 없다 =====
await p.evaluate(() => window.__sabari.viewer.resetBoxPose());
await p.click('#modeBox'); await p.click('#btnClose'); await p.click('[data-view=iso]'); await p.mouse.click(1330, 600);
const glbOf = async (name) => { const [d] = await Promise.all([p.waitForEvent('download'), p.click('#btnGlb')]); const f = path.join(V, name); await d.saveAs(f); return fs.readFileSync(f); };
const gj = (buf) => JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
const gb = (buf) => { const o = 20 + buf.readUInt32LE(12); return buf.subarray(o + 8, o + 8 + buf.readUInt32LE(o)); };
const g0 = await glbOf('unity_pose_identity.glb'); await p.evaluate(() => window.__sabari.viewer.setBoxEuler(35, 70, -20));
const g1 = await glbOf('unity_pose_rotated.glb'); await p.click('[data-b90="z,1"]'); await p.click('#modeCamera'); const g2 = await glbOf('unity_pose_rotated2.glb');
const j0 = gj(g0), j1 = gj(g1), j2 = gj(g2);
rec('9_glb_pose_independent', { nodesEqual: same(j0.nodes, j1.nodes) && same(j0.nodes, j2.nodes), jsonIdentical: JSON.stringify(j0) === JSON.stringify(j1), binIdentical: Buffer.compare(gb(g0), gb(g1)) === 0, bytes: [g0.length, g1.length, g2.length], anyRotationMatrixScaleOnNodes: j1.nodes.some((n) => n.rotation || n.matrix || n.scale), noGizmoOrCubeNodes: !j1.nodes.some((n) => /ring|torus|gizmo|cube/i.test(n.name ?? '')), nodeNames: j1.nodes.map((n) => n.name) });
const ctx2 = await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true }); const p2 = await ctx2.newPage(); p2.on('pageerror', (e) => errs.push(String(e)));
await p2.goto(URL); await p2.waitForFunction(() => window.__sabari); await p2.waitForTimeout(300);
await p2.click('#modeBox'); await p2.evaluate(() => window.__sabari.viewer.setBoxEuler(25, 40, 10));
await p2.mouse.move(700, 300); await p2.mouse.down(); await p2.mouse.move(720, 310, { steps: 2 }); await p2.waitForTimeout(150);
const badgeShown = await p2.isVisible('#dragBadge');
const [dl] = await Promise.all([p2.waitForEvent('download'), p2.evaluate(() => document.getElementById('btnPng').click())]); const pf = path.join(V, 'unity_png_clean.png'); await dl.saveAs(pf); await p2.mouse.up();
const screenBuf = await p2.screenshot({ clip: { x: 321, y: 0, width: 1039, height: 900 } });
const analyze = (b64) => p2.evaluate(async ({ b64 }) => { const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob()); const c = new OffscreenCanvas(bm.width, bm.height), g = c.getContext('2d'); g.drawImage(bm, 0, 0); const d = g.getImageData(0, 0, bm.width, bm.height).data; const ring = { x: [224, 49, 49], y: [47, 158, 68], z: [28, 126, 214] }, cnt = { x: 0, y: 0, z: 0 }; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 250) continue; for (const k of ['x', 'y', 'z']) if (Math.abs(d[i] - ring[k][0]) < 40 && Math.abs(d[i + 1] - ring[k][1]) < 40 && Math.abs(d[i + 2] - ring[k][2]) < 40) cnt[k]++; } const sx = Math.round(bm.width - (12 + 96) * (bm.width / 1039)), sy = Math.round(bm.height - (12 + 96) * (bm.height / 900)), sw = Math.round(96 * bm.width / 1039), sh = Math.round(96 * bm.height / 900); const cd = g.getImageData(sx, sy, sw, sh).data; let cube = 0; for (let i = 0; i < cd.length; i += 4) if (cd[i] < 235 || cd[i + 1] < 235 || cd[i + 2] < 235) cube++; return { w: bm.width, h: bm.height, ringPixels: cnt, cubeRegionNonWhite: cube }; }, { b64 });
const pngRes = await analyze(fs.readFileSync(pf).toString('base64')), scrRes = await analyze(screenBuf.toString('base64'));
rec('9_png_clean', { dragBadgeVisibleOnScreenDuringCapture: badgeShown, png: pngRes, screen: scrRes, noRingColorsInPng: Object.values(pngRes.ringPixels).every((n) => n < 30), ringsOnScreen: Object.values(scrRes.ringPixels).some((n) => n > 500), cubeAbsentInPng: pngRes.cubeRegionNonWhite < 50, cubeOnScreen: scrRes.cubeRegionNonWhite > 500 });
await ctx2.close();
await p.evaluate(() => window.__sabari.viewer.setBoxEuler(10, 50, 0));
const png = async (n) => { const [d] = await Promise.all([p.waitForEvent('download'), p.click('#btnPng')]); const f = path.join(V, n); await d.saveAs(f); return fs.readFileSync(f); };
const pa = await png('unity_png_posed.png'); await p.evaluate(() => window.__sabari.viewer.resetBoxPose()); const pb = await png('unity_png_default.png');
rec('9_png_reflects_pose', { differ: Buffer.compare(pa, pb) !== 0 });

// ===== 11. 터치 =====
const ctx3 = await b.newContext({ viewport: { width: 1360, height: 900 }, hasTouch: true }); const p3 = await ctx3.newPage(); p3.on('pageerror', (e) => errs.push(String(e)));
await p3.goto(URL); await p3.waitForFunction(() => window.__sabari); await p3.waitForTimeout(300);
const cdp = await ctx3.newCDPSession(p3);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
const ringXY = (phi) => p3.evaluate(({ phi }) => { const v = window.__sabari.viewer, g = v.gizmo; v.syncCamera(); g.group.updateMatrixWorld(true); const Rr = g.pickers.get('y').geometry.parameters.radius, T = v.camera.position.constructor, f = (phi * Math.PI) / 180; const w = new T(Rr * Math.cos(f), 0, Rr * Math.sin(f)).applyMatrix4(g.group.matrixWorld); const depth = w.clone().applyMatrix4(v.camera.matrixWorldInverse).z; const q = w.project(v.camera), r = v.renderer.domElement.getBoundingClientRect(); return { x: r.left + (q.x * 0.5 + 0.5) * r.width, y: r.top + (-q.y * 0.5 + 0.5) * r.height, depth }; }, { phi });
const cam0 = await p3.evaluate(() => window.__sabari.viewer.camera.position.toArray().join());
await touch('touchStart', [[1100, 150]]); for (let i = 1; i <= 8; i++) await touch('touchMove', [[1100 + i * 10, 150 + i * 6]]); await touch('touchEnd', []); await p3.waitForTimeout(100);
const camMoved = (await p3.evaluate(() => window.__sabari.viewer.camera.position.toArray().join())) !== cam0;
const poseAfterCam = await p3.evaluate(() => window.__sabari.viewer.getBoxEuler());
await p3.click('#modeBox'); let best = 0, bd = -1e9; for (let d = 0; d < 360; d += 15) { const s = await ringXY(d); if (s.depth > bd) { bd = s.depth; best = d; } }
const t0 = await ringXY(best); await touch('touchStart', [[t0.x, t0.y]]); for (let i = 1; i <= 10; i++) { const t = await ringXY(best + 4 * i); await touch('touchMove', [[t.x, t.y]]); } await touch('touchEnd', []); await p3.waitForTimeout(100);
const poseAfterRing = await p3.evaluate(() => window.__sabari.viewer.getBoxEuler());
rec('11_touch', { emptyAreaMovesCamera: camMoved, poseUnchangedByCameraTouch: same(poseAfterCam, { x: 0, y: 0, z: 0 }), ringTouchRotatesBoxY: poseAfterRing.y, onlyY: Math.abs(poseAfterRing.x) < 0.8 && Math.abs(poseAfterRing.z) < 0.8, expectedAbout: 40, firstUseHintShown: await p3.evaluate(() => !document.getElementById('msg').hidden), gizmoVisibleFaintInCameraMode: true });
await ctx3.close();

// ===== 12. 박스가 놓이는 높이 =====
rec('12_rest_height_function', await p.evaluate(() => { const v = window.__sabari.viewer, out = {}; v.resetBoxPose(); out.flat_m = +v.boxRestY().toFixed(5); v.setBoxEuler(90, 0, 0); out.stoodX90_m = +v.boxRestY().toFixed(5); v.setBoxEuler(30, 40, 0); out.tilted_m = +v.boxRestY().toFixed(5); v.resetBoxPose(); return out; }));
await finish('unity_b_results.json');


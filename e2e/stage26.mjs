// 단계 26 축 잠금(면을 눌러 축을 정한다) 검증 (1/2): 축 선택·잠금 회전·순환·연속성·스냅. 결과: verification/stage26/stage26.json
// 사용: STAGE_OUT=verification/stage26 SABARI_URL=http://127.0.0.1:8874/ node e2e/stage26.mjs   (이어서 e2e/stage26_b.mjs)
import { assert, dot, start } from './stage24_common.mjs';
const { p, rec, results, H, quat, rel, drag, reset, visible, shot, faceCenter, colorFaces, finish } = await start();
await colorFaces();
const normalizeMinus = (t) => t.replace(/−/g, '-');
const badgeDeg = async () => { const t = (await p.isVisible('#rotBadge')) ? normalizeMinus(await p.textContent('#rotBadge')) : ''; const m = t.match(/(-?\d+(?:\.\d+)?)°/); return { text: t, deg: m ? +m[1] : null }; };
const lockState = () => p.evaluate(() => { const v = window.__sabari.viewer, a = v.getLockAxisLocal(), w = v.getLockAxisWorld(); const h = document.getElementById('lockHint'); return { on: v.isLockOn(), face: v.getLockFace(), local: a ? a.toArray() : null, world: w ? w.toArray() : null, hint: h.hidden ? '' : h.textContent, pressed: document.getElementById('lockToggle').getAttribute('aria-pressed'), selected: v.selected }; });
const meshNormal = (id) => p.evaluate((id) => { const v = window.__sabari.viewer, mesh = v.faceMeshes.get(id); mesh.updateWorldMatrix(true, false); return new (v.camera.position.constructor)().fromBufferAttribute(mesh.geometry.getAttribute('normal'), 0).transformDirection(mesh.matrixWorld).toArray(); }, id);
const centerXY = () => p.evaluate(() => { const v = window.__sabari.viewer, c = v.models.editor.pivot.getWorldPosition(v.camera.position.clone()).project(v.camera), r = v.renderer.domElement.getBoundingClientRect(); return [r.left + (c.x * 0.5 + 0.5) * r.width, r.top + (-c.y * 0.5 + 0.5) * r.height]; });
const setLid = async (show) => { if ((await p.isChecked('#showLid')) !== show) await p.click('#showLid'); };
const setBase = async (show) => { if ((await p.isChecked('#showBase')) !== show) await p.click('#showBase'); };
const pickFace = async (id) => { const [x, y] = await faceCenter(id); await p.mouse.click(x, y); return lockState(); };
const dotAbs = (a, b) => Math.abs(dot(a, b));

// 축 잠금 드래그: Ctrl 스냅으로 배지가 target(도, 부호 무관)이 될 때까지 from 에서 dir 방향으로 커서를 옮긴 뒤 놓는다
const dragSnap = async (from, dir, target, { step = 5, max = 900 } = {}) => {
  await p.mouse.move(...from); await p.mouse.down(); await p.keyboard.down('Control'); let b = { deg: null, text: '' };
  for (let i = 1; i <= max; i++) { await p.mouse.move(from[0] + dir[0] * step * i, from[1] + dir[1] * step * i); b = await badgeDeg(); if (b.deg !== null && Math.abs(b.deg) >= target) break; }
  await p.keyboard.up('Control'); await p.mouse.up(); return b;
};

// ===== B. 축 선택: 면 10개 · 마주 보는 면 · 자세가 돌아 있어도 · 무시되는 곳 · 편집 면 선택 불변
await p.click('#faceList button[data-face=lid_front]'); const selected0 = (await lockState()).selected;
await p.click('#lockToggle'); const onState = await lockState();
rec('B0_toggle_on', onState); assert(onState.on && onState.pressed === 'true' && onState.hint === '박스의 면을 눌러 축을 정하세요' && onState.face === null);
const plan = [['lid_top', 'top', true, true], ['lid_front', 'front', true, true], ['lid_back', 'back', true, true], ['lid_left', 'left', true, true], ['lid_right', 'right', true, true], ['base_front', 'front', false, true], ['base_back', 'back', false, true], ['base_left', 'left', false, true], ['base_right', 'right', false, true], ['base_bottom', 'bottom', false, true]];
const faceRows = {}, localAxes = {};
for (const [id, view, lid] of plan) {
  await setLid(lid); await p.click(`[data-view=${view}]`); await p.waitForTimeout(100);
  const st = await pickFace(id), n = await meshNormal(id);
  localAxes[id] = st.local;
  faceRows[id] = { view, lidShown: lid, lockFace: st.face, local: st.local?.map((x) => +x.toFixed(6)), meshNormal: n.map((x) => +x.toFixed(6)), maxErr: st.local ? Math.max(...st.local.map((x, i) => Math.abs(x - n[i]))) : null, hint: st.hint, editSelectedUnchanged: st.selected === selected0 };
  assert(st.face === id && faceRows[id].maxErr < 1e-6 && st.selected === selected0 && st.hint.includes('기준 축으로 돕니다. 다른 면을 누르면 축이 바뀝니다.'), `면 ${id}`);
}
await setLid(true);
const pairs = [['lid_top', 'base_bottom'], ['lid_front', 'lid_back'], ['lid_left', 'lid_right'], ['base_front', 'base_back'], ['base_left', 'base_right']];
const opposite = pairs.map(([a, b]) => ({ pair: [a, b], absDot: +dotAbs(localAxes[a], localAxes[b]).toFixed(9) }));
rec('B1_faces_10', { rows: faceRows, selectedBeforeAndAfter: selected0, hintExample: faceRows.lid_top.hint });
rec('B2_opposite_faces_same_axis', { rows: opposite, all: opposite.every((r) => r.absDot > 1 - 1e-9) }); assert(results.B2_opposite_faces_same_axis.all);

// 이미 돌아 있는 자세: 면의 "현재" 법선을 따른다
const rotated = [];
for (const q of [[0.4, 0.5, 0.3, 0.70710678], [0.1, -0.6, 0.5, 0.6], [0.7, 0.1, -0.2, 0.68]]) {
  await p.evaluate((qq) => { const v = window.__sabari.viewer; v.setBoxQuat(new v.boxQuat.constructor(...qq)); v.fit(); }, q); await p.waitForTimeout(100);
  const vis = await visible(), id = vis.dominant, st = await pickFace(id), nw = await meshNormal(id);
  rotated.push({ q, face: id, pickedFace: st.face, worldAxisVsFaceWorldNormalAbsDot: +dotAbs(st.world, nw).toFixed(9), localAxisUnchangedByPose: undefined });
  assert(st.face === id && dotAbs(st.world, nw) > 1 - 1e-9);
}
rec('B3_rotated_pose_uses_current_normal', rotated);

// 무시되는 곳: 배경 · 두께면/안쪽면
await reset(); const before = await lockState();
await p.mouse.click(1330, 780); const bg = await lockState();
const scan = (names) => p.evaluate((names) => { const v = window.__sabari.viewer, m = v.debugIdMap(), { w, h, data, names: ids } = m, r = v.renderer.domElement.getBoundingClientRect(), k = w / r.width; const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : data[(y * w + x) * 4]); for (const want of names) { const idx = ids.indexOf(want) + 1; if (!idx) continue; for (let y = 3; y < h - 3; y += 2) for (let x = 3; x < w - 3; x += 2) { if (at(x, y) === idx && at(x - 2, y) === idx && at(x + 2, y) === idx && at(x, y - 2) === idx && at(x, y + 2) === idx) return { name: want, x: r.left + x / k, y: r.top + y / k }; } } return null; }, names);
const ignored = [];
for (const [cfg, names] of [[{ lid: false, base: true, view: 'top' }, ['base_inner', 'base_rim']], [{ lid: true, base: false, view: 'bottom' }, ['lid_inner', 'lid_rim']], [{ lid: true, base: true, view: 'iso' }, ['lid_rim', 'base_rim']]]) {
  await setLid(cfg.lid); await setBase(cfg.base); await p.click(cfg.view === 'iso' ? '#btnIso' : `[data-view=${cfg.view}]`); await p.waitForTimeout(120);
  for (const nm of names) { const hit = await scan([nm]); if (!hit) { ignored.push({ name: nm, config: cfg, found: false }); continue; } await p.mouse.click(hit.x, hit.y); const st = await lockState(); ignored.push({ name: nm, config: cfg, found: true, lockFaceUnchanged: st.face === before.face, hint: st.hint }); }
}
await setLid(true); await setBase(true);
rec('B4_ignored_clicks', { background: { lockFaceUnchanged: bg.face === before.face, hint: bg.hint }, thicknessAndInner: ignored });
assert(bg.face === before.face && bg.hint === '면을 눌러 주세요');
const found = ignored.filter((r) => r.found); assert(found.length >= 2 && found.every((r) => r.lockFaceUnchanged && r.hint === '면을 눌러 주세요'), '두께면·안쪽면 클릭 무시');

// 잠금을 끄면 클릭이 평소처럼 편집 면을 선택한다
await p.click('#lockToggle'); const offState = await lockState(); await reset(); const [tx, ty] = await faceCenter('lid_top'); await p.mouse.click(tx, ty); const afterOff = await lockState();
rec('B5_lock_off_click_selects', { off: { on: offState.on, pressed: offState.pressed, face: offState.face, hint: offState.hint }, selectedAfterClick: afterOff.selected });
assert(!offState.on && offState.face === null && afterOff.selected === 'lid_top');

// ===== C. 축 잠금 회전: 축 벡터 일치·순환·무한 회전·원위치
const lockAndTop = async (faceId, pre) => { // 축을 정한 면은 눈에 보이는 시점에서 누르고, 잠금은 유지한 채 윗면 시점으로 간다
  if (!(await lockState()).on) await p.click('#lockToggle');
  await reset(); for (let i = 0; i < 3; i++) { if ((await visible()).faces.some((f) => f.startsWith(`${faceId}:`))) break; await p.click('#btnIso'); await p.waitForTimeout(100); }
  if (pre) await p.click(`[data-view=${pre}]`);
  const st = await pickFace(faceId); assert(st.face === faceId, `${faceId} 선택`); await p.click('[data-view=top]'); await p.waitForTimeout(100); return lockState();
};
const cycles = {};
for (const [faceId, dir, expectFaces] of [['lid_left', [0, 1], ['lid_top', 'lid_front', 'base_bottom', 'lid_back']], ['lid_front', [1, 0], ['lid_top', 'lid_left', 'base_bottom', 'lid_right']]]) {
  const st0 = await lockAndTop(faceId); const [cx, cy] = await centerXY(); const q0 = await quat(); const seq = [await (async () => (await visible()).dominant)()], steps = [];
  const axisW = st0.world; let prev = q0;
  for (let i = 0; i < 4; i++) {
    const b = await dragSnap([cx, cy], dir, 90); const q = await quat(), r = await rel(prev, q); prev = q; steps.push({ badge: b.text, angleDeg: +r.angleDeg.toFixed(6), axisAbsDotLockAxis: +dotAbs(r.axis, axisW).toFixed(9) });
    seq.push((await visible()).dominant); if (i === 0) await shot(`C_${faceId}_axis_90.png`);
    assert(Math.abs(r.angleDeg - 90) < 1e-6 && dotAbs(r.axis, axisW) > 1 - 1e-6, `${faceId} 90° 스텝 ${i}`);
  }
  const back = await rel(q0, prev);
  cycles[faceId] = { lockAxisWorld: axisW.map((x) => +x.toFixed(6)), dominantFaceSequence: seq, expectedCycleSet: expectFaces, visitsAllFour: new Set(seq.slice(0, 4)).size === 4 && expectFaces.every((f) => seq.slice(0, 4).includes(f)), returnsAfter360DiffDeg: +back.angleDeg.toFixed(6), steps };
  assert(cycles[faceId].visitsAllFour && back.angleDeg < 1e-4, `${faceId} 순환`);
  // 무한 회전: 한 번의 드래그로 450° (360° 를 넘겨도 계속 돈다)
  const qs = await quat(); const b = await dragSnap([cx, cy], dir, 450, { step: 6, max: 1500 }); const r = await rel(qs, await quat());
  cycles[faceId].oneDrag450 = { badge: b.text, relAngleDeg: +r.angleDeg.toFixed(4), expected: 90, axisAbsDot: +dotAbs(r.axis, axisW).toFixed(9) };
  assert(Math.abs(Math.abs(b.deg) - 450) < 1e-9 && Math.abs(r.angleDeg - 90) < 1e-4);
}
rec('C_cycles', cycles);

// 윗면을 축으로 정하고(카메라를 향한 축) 원형 드래그 = 제자리 회전, 360° 후 원위치
{
  const st0 = await lockAndTop('lid_top'); const [cx, cy] = await centerXY(), q0 = await quat(), axisW = st0.world; const Rpx = 60;
  await p.mouse.move(cx + Rpx, cy); await p.mouse.down(); await p.keyboard.down('Control'); let b = { deg: 0 }, i = 0;
  for (; i < 800; i++) { const phi = -(i * 4 * Math.PI) / 180; await p.mouse.move(cx + Rpx * Math.cos(phi), cy + Rpx * Math.sin(phi)); b = await badgeDeg(); if (b.deg !== null && Math.abs(b.deg) >= 360) break; }
  await p.keyboard.up('Control'); await p.mouse.up(); const r = await rel(q0, await quat()), v = await visible(); await shot('C_lid_top_axis_circle.png');
  rec('C_circle_around_top_axis', { badge: b.text, circleSteps: i, afterReleaseDiffDeg: +r.angleDeg.toFixed(6), lockAxisWorld: axisW.map((x) => +x.toFixed(6)), dominantAfter: v.dominant });
  assert(Math.abs(Math.abs(b.deg) - 360) < 1e-9 && r.angleDeg < 1e-4 && v.dominant === 'lid_top');
}

// ===== D. 연속성: 같은 드래그량의 각도 변화를 축이 화면 평면 안 → 카메라를 향함으로 바꿔 가며 측정
await reset(); await p.click('[data-view=front]'); if (!(await lockState()).on) await p.click('#lockToggle'); await pickFace('lid_top'); const cont = [];
for (let t = 0; t <= 90; t += 3) { // 박스를 화면 가로축 둘레로 t° 눕혀 잠근 축(윗면 법선)이 시선과 이루는 각을 90°(평면)에서 (90−t)°로
  await p.evaluate((deg) => { const v = window.__sabari.viewer; v.setBoxQuat(new v.boxQuat.constructor().setFromAxisAngle(new v.camera.position.constructor(1, 0, 0), deg * Math.PI / 180)); }, t);
  const [cx, cy] = await centerXY(), q0 = await quat(); await p.mouse.move(cx + 45, cy + 30); await p.mouse.down(); await p.mouse.move(cx + 45 + 24, cy + 30 + 24, { steps: 6 }); await p.mouse.up(); // 대각선 24px
  const q1 = await quat(), r = await rel(q0, q1), axisW = await p.evaluate(() => window.__sabari.viewer.getLockAxisWorld().toArray()); const sgn = Math.sign(dot(r.axis, axisW)) || 1;
  cont.push({ tiltDeg: t, angleDeg: +(sgn * r.angleDeg).toFixed(4), axisAbsDot: +dotAbs(r.axis, axisW).toFixed(9) });
}
const diffs = cont.slice(1).map((c, i) => Math.abs(c.angleDeg - cont[i].angleDeg));
rec('D_continuity', { samples: cont, maxAdjacentJumpDeg: +Math.max(...diffs).toFixed(4), maxAngleDeg: Math.max(...cont.map((c) => Math.abs(c.angleDeg))), minAngleDeg: Math.min(...cont.map((c) => Math.abs(c.angleDeg))), allAxisMatch: cont.every((c) => c.axisAbsDot > 1 - 1e-6 || c.angleDeg === 0) });
assert(results.D_continuity.maxAdjacentJumpDeg < 8, '연속성: 인접 구간 최대 변화'); assert(results.D_continuity.allAxisMatch);

// ===== E. 스냅(자유): 대각선 + Ctrl = 가로·세로 각각 15° 단위
await p.click('#lockToggle'); await reset(); await p.evaluate(() => window.__sabari.viewer.resetBoxPose()); const snapRows = [];
for (const [dx, dy] of [[100, -60], [37, 61], [-171, 143]]) {
  const q0 = await quat(), ax = await p.evaluate(() => { const v = window.__sabari.viewer, q = v.camera.quaternion, T = v.camera.position.constructor; return { up: new T(0, 1, 0).applyQuaternion(q).toArray(), right: new T(1, 0, 0).applyQuaternion(q).toArray() }; }), h = await H();
  const info = await drag([700, 450], [700 + dx, 450 + dy], 10, { ctrl: true }); const q1 = await quat();
  const sn = (px) => Math.round((px / h) * 360 / 15) * 15, ex = await p.evaluate(({ q0, up, right, a, b }) => { const T = window.__sabari.viewer.boxQuat.constructor, V = window.__sabari.viewer.camera.position.constructor; return new T().setFromAxisAngle(new V(...right), b * Math.PI / 180).multiply(new T().setFromAxisAngle(new V(...up), a * Math.PI / 180)).multiply(new T(...q0)).toArray(); }, { q0, ...ax, a: sn(dx), b: sn(dy) });
  snapRows.push({ dx, dy, snappedAboutScreenVerticalDeg: sn(dx), snappedAboutScreenHorizontalDeg: sn(dy), badge: info.badge, snapStyle: info.snapClass, quatMaxErr: Math.max(...q1.map((x, i) => Math.abs(x - ex[i]))) });
}
rec('E_free_snap', { rows: snapRows, all15: snapRows.every((r) => r.snappedAboutScreenVerticalDeg % 15 === 0 && r.snappedAboutScreenHorizontalDeg % 15 === 0 && r.quatMaxErr < 1e-6 && r.snapStyle) });
assert(results.E_free_snap.all15);
await finish('stage26.json');

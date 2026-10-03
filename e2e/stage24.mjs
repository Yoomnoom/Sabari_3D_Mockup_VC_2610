// 단계 24 화면 기준 회전 검증 (1/2): 문 돌리기·순환·방향 잠금·방향 선택·핵심 시나리오·스냅. 결과: verification/stage24/stage24.json
// 사용: SABARI_URL=http://127.0.0.1:8874/ node e2e/stage24.mjs   (이어서 e2e/stage24_b.mjs)
import { assert, dot, start } from './stage24_common.mjs';
const { p, rec, results, H, quat, camAxes, rel, drag, setAxis, reset, visible, shot, colorFaces, finish } = await start();
await colorFaces();

// ===== 1. 윗면·아랫면 시점에서 가로 드래그 = 문처럼 돌아 날개면이 보인다
const door = {};
for (const view of ['top', 'bottom']) {
  await p.click(`[data-view=${view}]`); await setAxis('horizontal'); await p.waitForTimeout(80);
  const v0 = await visible(), q0 = await quat(), ax = await camAxes();
  await drag([700, 450], [700 + (await H()) / 6, 450], 10); // 60°
  const q1 = await quat(), v1 = await visible(), r = await rel(q0, q1);
  await shot(`01_${view}_after_horizontal_drag.png`);
  door[view] = { before: v0.faces, after: v1.faces, angleDeg: +r.angleDeg.toFixed(3), axisDotScreenUp: +Math.abs(dot(r.axis, ax.up)).toFixed(6), axisDotScreenRight: +Math.abs(dot(r.axis, ax.right)).toFixed(6), wingVisibleAfter: v1.faces.filter((f) => !/_(top|bottom):/.test(f)).length > 0 };
  assert(door[view].wingVisibleAfter, `${view}: 날개면이 보이지 않음`); assert(door[view].axisDotScreenUp > 0.999999 && Math.abs(door[view].angleDeg - 60) < 0.01);
}
rec('1_door_turn_top_bottom', door);

// ===== 2. 세로 드래그를 크게 반복: 끊김 없이 순환, 360° 후 복귀
await p.click('[data-view=top]'); await setAxis('vertical'); await p.waitForTimeout(80);
const hh = await H(), qStart = await quat(), seq = [], steps = [];
let prev = qStart, cum = 0;
for (let i = 0; i < 16; i++) { // 90°씩 16번 = 1440°(4바퀴, 극점을 16번 지난다)
  await drag([700, 300], [700, 300 + hh / 4], 9); const q = await quat(), r = await rel(prev, q); steps.push(+r.angleDeg.toFixed(3)); cum += r.angleDeg; prev = q;
  if (i < 8) seq.push((await visible()).dominant);
  if (i === 0) await shot('02_vertical_90_from_top.png');
}
const rEnd = await rel(qStart, prev);
rec('2_vertical_cycle', { dominantFacePerQuarterTurn: seq, stepAnglesDeg: steps, allStepsAbout90: steps.every((s) => Math.abs(s - 90) < 0.02), cumulativeDeg: +cum.toFixed(2), angleDiffAfter4TurnsDeg: +rEnd.angleDeg.toFixed(4), cycleRepeats: seq.length === 8 && [0, 1, 2, 3].every((i) => seq[i] === seq[i + 4]), fourDistinctFaces: new Set(seq.slice(0, 4)).size === 4 });
assert(results['2_vertical_cycle'].allStepsAbout90 && results['2_vertical_cycle'].cycleRepeats && results['2_vertical_cycle'].fourDistinctFaces && results['2_vertical_cycle'].angleDiffAfter4TurnsDeg < 0.01);

// ===== 3. 방향 잠금: 대각선 드래그해도 선택한 방향 외 성분 0
await reset(); const lock = {};
for (const [mode, other] of [['horizontal', 'right'], ['vertical', 'up']]) {
  await setAxis(mode); const rows = [];
  for (const [dx, dy] of [[180, 140], [-120, 200], [90, -260], [-300, -50]]) {
    const q0 = await quat(), ax = await camAxes(); await drag([700, 450], [700 + dx, 450 + dy], 12); const r = await rel(q0, await quat());
    rows.push({ dx, dy, angleDeg: +r.angleDeg.toFixed(3), expectedAbsDeg: +Math.abs((mode === 'horizontal' ? dx : dy) / (await H()) * 360).toFixed(3), axisDotOtherScreenAxis: +Math.abs(dot(r.axis, ax[other])).toFixed(9) });
  }
  lock[mode] = { rows, otherComponentZero: rows.every((r) => r.axisDotOtherScreenAxis < 1e-6), angleMatches: rows.every((r) => Math.abs(r.angleDeg - r.expectedAbsDeg) < 0.05) };
  assert(lock[mode].otherComponentZero && lock[mode].angleMatches, `잠금 ${mode}`);
}
rec('3_direction_lock', lock);

// ===== 4. 방향 선택: 버튼·T 키·단축키 설정·새로고침
const st = async () => ({ h: await p.getAttribute('#rotH', 'aria-pressed'), v: await p.getAttribute('#rotV', 'aria-pressed'), label: await p.textContent('#rotDirLabel'), axis: await p.evaluate(() => window.__sabari.viewer.rotateAxis) });
const sel = {}; await p.click('#rotH'); sel.afterH = await st(); await p.click('#rotV'); sel.afterV = await st();
await p.mouse.click(1330, 780); await p.keyboard.press('t'); sel.afterKeyT_fromV = await st(); await p.keyboard.press('t'); sel.afterKeyT_again = await st();
await p.evaluate(() => { document.getElementById('dHelp').open = true; }); await p.uncheck('#optKeys'); await p.mouse.click(1330, 780); const before = await st(); await p.keyboard.press('t'); sel.keysDisabled_unchanged = { before, after: await st() }; await p.check('#optKeys'); await p.evaluate(() => { document.getElementById('dHelp').open = false; });
await p.click('#rotV'); await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(400); sel.afterReload_V = await st(); sel.poseAfterReload = await quat();
await p.click('#rotH'); await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(400); sel.afterReload_H = await st();
rec('4_direction_select', sel);
assert.equal(sel.afterH.axis, 'horizontal'); assert.equal(sel.afterV.axis, 'vertical'); assert.equal(sel.afterKeyT_fromV.axis, 'horizontal'); assert.equal(sel.afterKeyT_again.axis, 'vertical');
assert.deepEqual(sel.keysDisabled_unchanged.before, sel.keysDisabled_unchanged.after); assert.equal(sel.afterReload_V.axis, 'vertical'); assert.equal(sel.afterReload_H.axis, 'horizontal');
assert(sel.poseAfterReload.every((x, i) => Math.abs(x - [0, 0, 0, 1][i]) < 1e-9));
await colorFaces(); // 새로고침으로 사라진 면 이미지를 다시 넣는다

// ===== 5. 핵심 시나리오: 위아래로 + Ctrl 90° 로 세우고(긴 변이 세로), 좌우로 돌리기
const lidTopGeom = () => p.evaluate(() => { const v = window.__sabari.viewer, mesh = v.faceMeshes.get('lid_top'); mesh.updateWorldMatrix(true, false); const pos = mesh.geometry.getAttribute('position'), T = v.camera.position.constructor; const P = (i) => new T().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); const a = P(0), b = P(1), c = P(2); const e1 = b.clone().sub(a), e2 = c.clone().sub(b); const long = (e1.length() > e2.length() ? e1 : e2).normalize(); const up = new T(0, 1, 0).applyQuaternion(v.camera.quaternion); const toCam = v.camera.position.clone().sub(v.controls.target).normalize(); return { longWorld: long.toArray(), longVsScreenVertical: Math.abs(long.dot(up)), lidTopFacesCamera: Math.abs(e1.clone().cross(e2).normalize().dot(toCam)) }; });
await p.click('[data-view=right]'); await setAxis('vertical'); await p.waitForTimeout(80);
const q0s = await quat(); let stand = null;
for (const sign of [-1, 1]) { // 어느 방향이 상단면을 카메라 쪽으로 세우는지 찾는다(부호는 카메라 오른쪽 축 방향에 달려 있다)
  await p.click('[data-view=right]'); const info = await drag([700, 500], [700, 500 + sign * (await H()) / 4], 9, { ctrl: true });
  const v = await visible(), r = await rel(q0s, await quat());
  if (v.dominant === 'lid_top') { stand = { dragSign: sign, badge: info.badge, snapClass: info.snapClass, angleDeg: +r.angleDeg.toFixed(3), visible: v.faces, geom: await lidTopGeom() }; break; }
}
assert(stand, '세운 자세를 만들지 못함');
await shot('05_stood_up.png');
await setAxis('horizontal'); const standRows = [];
for (const dx of [140, -230, 310, 90, -60]) {
  const q0 = await quat(), ax = await camAxes(); await drag([700, 450], [700 + dx, 450 + 120], 10); const r = await rel(q0, await quat()), g = await lidTopGeom();
  standRows.push({ dx, angleDeg: +r.angleDeg.toFixed(3), axisDotScreenUp: +Math.abs(dot(r.axis, ax.up)).toFixed(9), axisDotScreenRight: +Math.abs(dot(r.axis, ax.right)).toFixed(9), longEdgeVsScreenVertical: +g.longVsScreenVertical.toFixed(9) });
}
await shot('05_stood_after_horizontal_drags.png');
rec('5_stand_then_turn_horizontally', { standing: stand, rows: standRows, longEdgeConstantVsScreenVertical: Math.max(...standRows.map((r) => r.longEdgeVsScreenVertical)) - Math.min(...standRows.map((r) => r.longEdgeVsScreenVertical)) < 1e-6, longEdgeTiltFromScreenVerticalDeg: +(Math.acos(standRows[0].longEdgeVsScreenVertical) * 180 / Math.PI).toFixed(3), longEdgeWithin7DegOfScreenVertical: standRows.every((r) => r.longEdgeVsScreenVertical > Math.cos(7 * Math.PI / 180)), rotatesOnlyAboutScreenVertical: standRows.every((r) => r.axisDotScreenUp > 0.999999 && r.axisDotScreenRight < 1e-6), note: '우측 시점의 카메라 고도(0.12/1 ≈ 6.9°)만큼 화면 세로축이 월드 Y에서 기울어 있어 긴 변은 화면 세로에서 항상 같은 각(≈6.9°)만 벗어난다(드래그해도 변하지 않음 = 화면 세로축 기준 회전). 카메라 고도 0°에서는 정확히 0°.' });
assert(results['5_stand_then_turn_horizontally'].longEdgeConstantVsScreenVertical && results['5_stand_then_turn_horizontally'].longEdgeWithin7DegOfScreenVertical && results['5_stand_then_turn_horizontally'].rotatesOnlyAboutScreenVertical);

// ===== 6. Ctrl 스냅·배지 값
await reset(); await setAxis('horizontal'); const snapRows = [];
for (const px of [37, 61, 100, 143, -52, -171]) {
  const q0 = await quat(); const info = await drag([700, 450], [700 + px, 450], 8, { ctrl: true }); const r = await rel(q0, await quat()), m = info.badge?.match(/([+-]?[\d.]+)°/);
  snapRows.push({ px, rawDeg: +(px / (await H()) * 360).toFixed(2), badge: info.badge, badgeDeg: m ? +m[1] : null, actualAbsDeg: +r.angleDeg.toFixed(3), multipleOf15: Math.abs(r.angleDeg / 15 - Math.round(r.angleDeg / 15)) < 1e-6, snapStyle: info.snapClass });
}
const plain = []; for (const px of [37, -52]) { const q0 = await quat(); const info = await drag([700, 450], [700 + px, 450], 8); const r = await rel(q0, await quat()), m = info.badge?.match(/([+-]?[\d.]+)°/); plain.push({ px, badge: info.badge, badgeDeg: m ? +m[1] : null, actualAbsDeg: +r.angleDeg.toFixed(3), snapStyle: info.snapClass }); }
rec('6_snap_and_badge', { snapped: snapRows, plain, badgeMatchesActual: [...snapRows, ...plain].every((r) => Math.abs(Math.abs(r.badgeDeg) - r.actualAbsDeg) < 0.06), snapAll15: snapRows.every((r) => r.multipleOf15 && r.snapStyle), badgeHiddenAfter: await p.isHidden('#rotBadge'), stand_dragSign: stand.dragSign });
assert(results['6_snap_and_badge'].badgeMatchesActual && results['6_snap_and_badge'].snapAll15 && results['6_snap_and_badge'].badgeHiddenAfter);
await finish('stage24.json');

// 유니티식 조작 검증 1: 모드·고리·호버·스냅·월드/로컬·숫자·90°·고급 카메라
// SABARI_URL=http://127.0.0.1:8766/ node e2e/unity.mjs
import { start, same, near } from './unity_common.mjs';
const { rec, p, eul, nums, quat, camState, setEuler, ringPt, bestPhi, dragRing, resetPose, shot, finish } = await start();

// ===== 0. 기본 상태 =====
rec('0_defaults', {
  cameraModePressed: await p.getAttribute('#modeCamera', 'aria-pressed'), spaceLocalPressed: await p.getAttribute('#btnSpace', 'aria-pressed'),
  advancedOpen: await p.evaluate(() => document.getElementById('dAngle').open), advancedSummary: await p.textContent('#dAngle > summary'),
  euler: await eul(), gizmoVisible: await p.evaluate(() => window.__sabari.viewer.gizmo.group.visible),
  gizmoOpacityCameraMode: await p.evaluate(() => +window.__sabari.viewer.gizmo.visuals.get('x').material.opacity.toFixed(2)),
  structure: await p.evaluate(() => { const v = window.__sabari.viewer; return { rootParentIsShift: v.models.editor.root.parent === v.shift, rootPos: v.models.editor.root.position.toArray(), rootQuat: v.models.editor.root.quaternion.toArray() }; }),
});
await shot('61_camera_mode');

// ===== 1. 모드 전환: 버튼·E 키·단축키 설정 끔 =====
await p.click('#modeBox');
const m1 = { pressed: await p.getAttribute('#modeBox', 'aria-pressed'), boxMode: await p.evaluate(() => window.__sabari.viewer.boxMode), opacity: await p.evaluate(() => +window.__sabari.viewer.gizmo.visuals.get('x').material.opacity.toFixed(2)), firstUseHint: await p.evaluate(() => !document.getElementById('msg').hidden) };
await p.click('#msgClose').catch(() => {});
await p.click('#modeCamera');
await p.mouse.click(1330, 100); await p.keyboard.press('e');
const m2 = await p.evaluate(() => window.__sabari.viewer.boxMode); await p.keyboard.press('e'); const m3 = await p.evaluate(() => window.__sabari.viewer.boxMode);
await p.click('#dHelp > summary'); await p.uncheck('#optKeys'); await p.mouse.click(1330, 100); await p.keyboard.press('e');
const m4 = await p.evaluate(() => window.__sabari.viewer.boxMode); await p.check('#optKeys'); await p.click('#dHelp > summary');
rec('1_mode_toggle', { button: m1, eKeyToBox: m2, eKeyBackToCamera: m3 === false, eIgnoredWhenKeysDisabled: m4 === false });

// ===== 2. 각 고리(월드): 해당 축으로만 돌고 숫자 3개가 일치 =====
await p.click('#modeBox'); await p.click('[data-view=iso]'); await p.click('#msgClose').catch(() => {});
const ringRows = {};
for (const [axis, delta] of [['x', 30], ['y', -40], ['z', 25]]) {
  await resetPose(); await p.waitForTimeout(80);
  const cam0 = await camState(); const d = await dragRing(axis, delta);
  const e = await eul(), n = await nums(), c1 = await camState();
  ringRows[axis] = { dragDeg: delta, euler: e, displayed: n, displayMatches: near(n[0], e.x, 0.01) && near(n[1], e.y, 0.01) && near(n[2], e.z, 0.01), onlyThisAxis: ['x', 'y', 'z'].filter((q) => q !== axis).every((q) => Math.abs(e[q]) < 0.8), axisValueError: +(e[axis] - (axis === 'y' ? -delta : delta)).toFixed(2), liveWhileDragging: d.live, badgeAtEnd: d.end.badge, badgeVisibleDuring: d.end.badgeVisible, cameraUnchanged: same(cam0.dir, c1.dir) && cam0.dist === c1.dist };
  if (axis === 'x') await shot('62_box_rotated_x30');
}
rec('2_ring_drag_world', ringRows);
rec('2_badge_hidden_after', await p.isHidden('#dragBadge'));

// ===== 2b. 호버 강조·라벨 =====
await resetPose();
const hv = {};
for (const axis of ['x', 'y', 'z']) { const pt = await ringPt(axis, await bestPhi(axis)); await p.mouse.move(pt.x, pt.y); await p.waitForTimeout(120); hv[axis] = { label: await p.evaluate(() => (document.getElementById('axisLabel').hidden ? null : document.getElementById('axisLabel').textContent)), opacity: await p.evaluate((a) => +window.__sabari.viewer.gizmo.visuals.get(a).material.opacity.toFixed(2), axis), cursor: await p.evaluate(() => window.__sabari.viewer.renderer.domElement.style.cursor) }; if (axis === 'y') await shot('63_hover_y'); }
await p.mouse.move(1000, 150); await p.waitForTimeout(100);
rec('2b_hover', { ...hv, labelHiddenOffRing: await p.isHidden('#axisLabel') });

// ===== 3. Ctrl 스냅 (15° 단위) =====
const snapRows = [];
for (const [want, expectDeg] of [[37, 30], [40, 45], [-22, -15], [6, 0], [91, 90]]) {
  await resetPose(); const d = await dragRing('y', -want, { ctrl: true, steps: 14 }); const e = await eul();
  snapRows.push({ dragged: want, expected: expectDeg, resultY: e.y, ok: near(e.y, expectDeg, 0.2), badge: d.end.badge, snapBadgeStyle: d.end.snapClass, multipleOf15: Math.abs(e.y / 15 - Math.round(e.y / 15)) < 0.02 });
}
await resetPose(); const noSnap = await dragRing('y', -37, { steps: 14 }); const eNo = await eul();
rec('3_snap', { rows: snapRows, allOk: snapRows.every((r) => r.ok && r.multipleOf15 && r.snapBadgeStyle), withoutCtrl: { dragged: 37, resultY: eNo.y, notSnapped: Math.abs(eNo.y - 37) < 1.5 && Math.abs(eNo.y % 15) > 0.5, badgeHasSnapText: noSnap.end.badge.includes('스냅') } });
await resetPose(); await setEuler(0, 37, 0);
rec('3_number_input_ignores_snap', await eul());

// ===== 4. 로컬/월드 전환 =====
await resetPose(); await setEuler(0, 90, 0); // 박스 X 축 = 월드 −Z
await p.click('#btnSpace');
const localInfo = await p.evaluate(() => { const v = window.__sabari.viewer; return { space: v.boxSpace, gizmoQuat: v.gizmo.group.quaternion.toArray().map((n) => +n.toFixed(4)), boxQuat: v.boxQuat.toArray().map((n) => +n.toFixed(4)), label: document.getElementById('btnSpace').textContent }; });
const q0 = await quat(); await dragRing('x', 30);
const afterLocal = await p.evaluate((q0a) => { const v = window.__sabari.viewer, T = v.boxQuat.constructor, V3 = v.camera.position.constructor; const a = new T(...q0a); const d = new T().setFromAxisAngle(new V3(1, 0, 0), Math.PI / 6); return { dotLocal: +Math.abs(v.boxQuat.dot(a.clone().multiply(d))).toFixed(4), dotWorld: +Math.abs(v.boxQuat.dot(d.clone().multiply(a))).toFixed(4) }; }, q0);
rec('4_local_space', { ...localInfo, gizmoFollowsBox: same(localInfo.gizmoQuat.map(Math.abs), localInfo.boxQuat.map(Math.abs)), afterLocalRingDrag: afterLocal, matchesLocalRotation: afterLocal.dotLocal > 0.999 && afterLocal.dotWorld < 0.99 });
await shot('64_local_space');
await p.click('#btnSpace'); await resetPose(); await setEuler(0, 90, 0);
const q0w = await quat(); await dragRing('x', 30);
rec('4_world_space_same_start', await p.evaluate((q0a) => { const v = window.__sabari.viewer, T = v.boxQuat.constructor, V3 = v.camera.position.constructor; const d = new T().setFromAxisAngle(new V3(1, 0, 0), Math.PI / 6); return { dotWorld: +Math.abs(v.boxQuat.dot(d.clone().multiply(new T(...q0a)))).toFixed(4), space: v.boxSpace }; }, q0w));

// ===== 5. 숫자 입력 = 실제 박스 자세 =====
await resetPose();
const typedRows = [];
for (const [x, y, z] of [[30, 0, 0], [0, 45, 0], [0, 0, -60], [20, 35, 70], [-45, 120, 10], [80, -170, 5], [10, 20, 30]]) {
  await setEuler(x, y, z);
  const r = await p.evaluate(({ x, y, z }) => { const v = window.__sabari.viewer, Eu = v.pivot.rotation.constructor, T = v.boxQuat.constructor, d = Math.PI / 180; const expected = new T().setFromEuler(new Eu(x * d, y * d, z * d, 'YXZ')); return { dot: +Math.abs(v.pivot.quaternion.dot(expected)).toFixed(6), pivotMatchesStore: Math.abs(v.pivot.quaternion.dot(v.boxQuat)) > 0.999999, shown: ['rbX', 'rbY', 'rbZ'].map((i) => +document.getElementById(i).value) }; }, { x, y, z });
  typedRows.push({ typed: [x, y, z], ...r });
}
rec('5_number_input', { rows: typedRows, allMatch: typedRows.every((r) => r.dot > 0.99999 && r.pivotMatchesStore) });
await setEuler(89, 0, 0); const gim = !(await p.isHidden('#gimbalInfo')); await setEuler(20, 0, 0);
rec('5_gimbal_notice', { shownAt89: gim, hiddenAt20: await p.isHidden('#gimbalInfo') });
await resetPose();

// ===== 6. 90° 버튼 4번 = 원위치 / 초기화 =====
await setEuler(20, 35, -10);
const start0 = await quat(); const four = {};
for (const sp of ['world', 'local']) {
  if ((await p.getAttribute('#btnSpace', 'aria-pressed')) !== String(sp === 'local')) await p.click('#btnSpace');
  for (const ax of ['x', 'y', 'z']) for (const sg of ['-1', '1']) {
    const b4 = await quat(); await p.click(`[data-b90="${ax},${sg}"]`); const a1 = await quat();
    for (let i = 0; i < 3; i++) await p.click(`[data-b90="${ax},${sg}"]`);
    const a4 = await quat();
    four[`${sp}_${ax}${sg === '1' ? '+' : '-'}`] = { changedAfter1: Math.abs(a1.reduce((s, v, i) => s + v * b4[i], 0)) < 0.9999, returnsAfter4: Math.abs(a4.reduce((s, v, i) => s + v * b4[i], 0)) > 0.99999 };
  }
}
rec('6_rotate90', { cases: four, all: Object.values(four).every((x) => x.changedAfter1 && x.returnsAfter4), startKept: Math.abs((await quat()).reduce((s, v, i) => s + v * start0[i], 0)) > 0.99999 });
await p.click('#btnSpace'); await p.click('#btnBoxReset');
rec('6_reset', { euler: await eul(), numbers: await nums(), quat: await quat() });
rec('6_camera_90_buttons_moved_to_advanced', await p.evaluate(() => ['rotLeft', 'rotRight', 'rotUp', 'rotDown'].map((i) => !!document.getElementById(i)?.closest('#dAngle'))));

// ===== 10. 고급 카메라 접힘·기억 =====
rec('10_advanced_default_closed', await p.evaluate(() => !document.getElementById('dAngle').open));
await p.evaluate(() => { document.getElementById('dAngle').open = true; }); await p.waitForTimeout(150); await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(300);
const adv1 = await p.evaluate(() => document.getElementById('dAngle').open);
await p.evaluate(() => { document.getElementById('dAngle').open = false; }); await p.waitForTimeout(150); await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(300);
rec('10_advanced_remembered', { openedThenReloadOpen: adv1, closedThenReloadClosed: await p.evaluate(() => !document.getElementById('dAngle').open) });
rec('10_advanced_features_kept', await p.evaluate(() => ['azN', 'elN', 'rlN', 'spN', 'btnLevelHorizon', 'btnAngleDefault'].every((i) => !!document.getElementById(i)?.closest('#dAngle')) && !!document.getElementById('btnLevel')));
await finish('unity_results.json');

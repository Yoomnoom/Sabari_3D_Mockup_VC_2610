// 단계 26b 검증: 회전축 버튼(정면·후면·좌측·우측·윗면·아래·3/4)으로 축 정하기. 결과: verification/stage26/stage26c.json
// 사용: STAGE_OUT=verification/stage26 SABARI_URL=http://127.0.0.1:8874/ node e2e/stage26c.mjs
import { spawnSync } from 'node:child_process';
import { OUT, ROOT, assert, dot, fs, path, start } from './stage24_common.mjs';
const { p, rec, results, quat, rel, drag, reset, visible, shot, faceCenter, colorFaces, finish } = await start();
await colorFaces();
const NAMES = ['front', 'back', 'left', 'right', 'top', 'bottom', 'iso'];
const LABEL = { front: '정면', back: '후면', left: '좌측', right: '우측', top: '윗면', bottom: '아래', iso: '3/4' };
const st = () => p.evaluate(() => { const v = window.__sabari.viewer, a = v.getLockAxisLocal(), w = v.getLockAxisWorld(), h = document.getElementById('lockHint'), row = document.getElementById('axisRow'); return { on: v.isLockOn(), face: v.getLockFace(), view: v.getLockView(), local: a ? a.toArray() : null, world: w ? w.toArray() : null, hint: h.hidden ? '' : h.textContent, rowHidden: row.hidden, rowDisabled: [...row.querySelectorAll('[data-axis]')].every((b) => b.disabled), pressed: Object.fromEntries([...row.querySelectorAll('[data-axis]')].map((b) => [b.dataset.axis, b.getAttribute('aria-pressed') === 'true'])), togglePressed: document.getElementById('lockToggle').getAttribute('aria-pressed'), hls: v.lockHls.map((o) => o.parent.name).sort(), line: !!v.lockLine, selected: v.selected }; });
const camPos = () => p.evaluate(() => window.__sabari.viewer.camera.position.toArray().map((x) => +x.toFixed(9)));
const viewDir = () => p.evaluate(() => { const v = window.__sabari.viewer, d = v.camera.position.clone().sub(v.controls.target).normalize(); return d.toArray(); });
const setPose = (q) => p.evaluate((qq) => { const v = window.__sabari.viewer; v.setBoxQuat(new v.boxQuat.constructor(...qq)); }, q);
const rotate = (qq, local) => p.evaluate(({ qq, local }) => { const v = window.__sabari.viewer, T = v.boxQuat.constructor; return new v.camera.position.constructor(...local).applyQuaternion(new T(...qq).normalize()).toArray(); }, { qq, local });
const maxDiffUpToSign = (a, b) => { const s = dot(a, b) < 0 ? -1 : 1; return Math.max(...a.map((x, i) => Math.abs(x - s * b[i]))); };
const centerXY = () => p.evaluate(() => { const v = window.__sabari.viewer, c = v.models.editor.pivot.getWorldPosition(v.camera.position.clone()).project(v.camera), r = v.renderer.domElement.getBoundingClientRect(); return [r.left + (c.x * 0.5 + 0.5) * r.width, r.top + (-c.y * 0.5 + 0.5) * r.height]; });
const badgeDeg = async () => { const t = (await p.isVisible('#rotBadge')) ? (await p.textContent('#rotBadge')).replace(/−/g, '-') : ''; const m = t.match(/(-?\d+(?:\.\d+)?)°/); return m ? +m[1] : null; };
const dragSnap = async (from, dir, target, step = 5, max = 900) => { await p.mouse.move(...from); await p.mouse.down(); await p.keyboard.down('Control'); let d = null; for (let i = 1; i <= max; i++) { await p.mouse.move(from[0] + dir[0] * step * i, from[1] + dir[1] * step * i); d = await badgeDeg(); if (d !== null && Math.abs(d) >= target) break; } await p.keyboard.up('Control'); await p.mouse.up(); return d; };

// ===== 1. 토글을 켜야 회전축 줄이 나타나고, 끄면 숨겨지며 잠금이 풀린다
const s0 = await st(); await p.click('#lockToggle'); const s1 = await st();
rec('1_row_visibility', { beforeOn: { rowHidden: s0.rowHidden, on: s0.on }, afterOn: { rowHidden: s1.rowHidden, on: s1.on, hint: s1.hint, pressed: s1.pressed, hls: s1.hls, line: s1.line } });
assert(s0.rowHidden && !s0.on && !s1.rowHidden && s1.on && s1.hint === '회전축 버튼을 누르거나 박스의 면을 눌러 축을 정하세요' && Object.values(s1.pressed).every((x) => !x));
const title = await p.evaluate(() => document.getElementById('axisRow').textContent.replace(/\s+/g, ' ').trim().slice(0, 40)); rec('1_row_title', title); assert(title.startsWith('회전축(그 방향을 바라보는 선)'));

// ===== 2. 7개 버튼: 축 = 그 시점이 박스를 바라보는 선(박스 국소), 마주 보는 쌍 함께 표시, 하이라이트, 카메라 불움직임
const expectedLocal = {}; // 각 시점 버튼을 눌렀을 때의 실제 시선 방향(고도 성분을 걷어낸 주축, 3/4 는 시선 그대로)
for (const n of NAMES) { await reset(); if (n !== 'iso') await p.click(`[data-view=${n}]`); await p.waitForTimeout(80); let d = await viewDir(); if (n !== 'iso') { const k = [0, 1, 2].reduce((a, b) => (Math.abs(d[a]) >= Math.abs(d[b]) ? a : b)); d = [0, 0, 0].map((_, i) => (i === k ? 1 : 0)); } expectedLocal[n] = d; }
const poses = [[0, 0, 0, 1], [0.4, 0.5, 0.3, 0.70710678], [0.1, -0.6, 0.5, 0.6], [0.7, 0.1, -0.2, 0.68]];
const axisRows = []; const PAIR = { front: ['front', 'back'], back: ['front', 'back'], left: ['left', 'right'], right: ['left', 'right'], top: ['top', 'bottom'], bottom: ['top', 'bottom'], iso: ['iso'] };
const HL = { front: ['base_back', 'base_front', 'lid_back', 'lid_front'], back: ['base_back', 'base_front', 'lid_back', 'lid_front'], left: ['base_left', 'base_right', 'lid_left', 'lid_right'], right: ['base_left', 'base_right', 'lid_left', 'lid_right'], top: ['base_bottom', 'lid_top'], bottom: ['base_bottom', 'lid_top'], iso: [] };
for (const n of NAMES) for (const q of poses) {
  await reset(); await setPose(q); const cam0 = await camPos();
  if (!(await st()).on) await p.click('#lockToggle');
  await p.click(`[data-axis=${n}]`); const a = await st(), cam1 = await camPos(), expWorld = await rotate(q, expectedLocal[n]);
  const pressed = Object.keys(a.pressed).filter((k) => a.pressed[k]).sort();
  const row = { view: n, pose: q.map((x) => +x.toFixed(2)), maxDiffLocal: +maxDiffUpToSign(a.local, expectedLocal[n]).toFixed(9), maxDiffWorld: +maxDiffUpToSign(a.world, expWorld).toFixed(9), pressed, expectedPressed: [...PAIR[n]].sort(), highlightedFaces: a.hls, cameraUnchanged: JSON.stringify(cam0) === JSON.stringify(cam1), lockViewName: a.view, hint: a.hint };
  axisRows.push(row);
  assert(row.maxDiffLocal < 1e-6 && row.maxDiffWorld < 1e-6 && JSON.stringify(row.pressed) === JSON.stringify(row.expectedPressed) && JSON.stringify(a.hls) === JSON.stringify(HL[n]) && a.line && row.cameraUnchanged && a.view === n && a.hint.includes(`'${LABEL[n]}' 방향 축으로 돕니다.`), `축 버튼 ${n} ${JSON.stringify(row)}`);
}
rec('2_axis_buttons', { expectedLocalAxes: expectedLocal, rows: axisRows, note: '3/4 축 = 3/4 시점(iso)의 시선 방향, 정면·후면 등은 시점 방향에서 카메라 고도 성분을 뺀 주축(마주 보는 시점은 같은 선)' });
const isoDir = await (async () => { await reset(); return viewDir(); })();
rec('2_iso_axis_equals_view_direction', { isoViewDir: isoDir.map((x) => +x.toFixed(6)), axisLocal: expectedLocal.iso.map((x) => +x.toFixed(6)), maxDiff: +Math.max(...isoDir.map((x, i) => Math.abs(x - expectedLocal.iso[i]))).toFixed(9) });

// ===== 3. 위쪽 시점 버튼은 카메라만 움직이고 축·잠금은 그대로
await reset(); await p.evaluate(() => window.__sabari.viewer.resetBoxPose()); if (!(await st()).on) await p.click('#lockToggle'); await p.click('[data-axis=left]'); const lockedBefore = await st(); const viewBtn = {};
for (const [n, sel] of [['front', '[data-view=front]'], ['top', '[data-view=top]'], ['bottom', '[data-view=bottom]'], ['iso', '#btnIso']]) { const c0 = await camPos(); await p.click(sel); await p.waitForTimeout(80); const a = await st(); viewBtn[n] = { cameraMoved: JSON.stringify(c0) !== JSON.stringify(await camPos()), lockStillOn: a.on, axisSame: JSON.stringify(a.local) === JSON.stringify(lockedBefore.local), lockView: a.view }; }
rec('3_view_buttons_only_move_camera', viewBtn); assert(Object.values(viewBtn).every((r) => r.lockStillOn && r.axisSame && r.lockView === 'left'));

// ===== 4. 윗면 시점에서 축을 잠그고 드래그: 순환·제자리 회전·무한 회전
const cycle = {};
for (const [axisName, dir, expectSet] of [['front', [1, 0], ['lid_top', 'lid_left', 'base_bottom', 'lid_right']], ['left', [0, 1], ['lid_top', 'lid_front', 'base_bottom', 'lid_back']]]) {
  await reset(); if (!(await st()).on) await p.click('#lockToggle'); await p.click(`[data-axis=${axisName}]`); await p.click('[data-view=top]'); await p.waitForTimeout(100);
  const a0 = await st(), [cx, cy] = await centerXY(), q0 = await quat(); const seq = [(await visible()).dominant], steps = []; let prev = q0;
  for (let i = 0; i < 4; i++) { const d = await dragSnap([cx, cy], dir, 90); const q = await quat(), r = await rel(prev, q); prev = q; steps.push({ badgeDeg: d, angleDeg: +r.angleDeg.toFixed(6), axisAbsDot: +Math.abs(dot(r.axis, a0.world)).toFixed(9) }); seq.push((await visible()).dominant); if (i === 0) await shot(`26c_${axisName}_axis_90.png`); assert(Math.abs(r.angleDeg - 90) < 1e-6 && Math.abs(dot(r.axis, a0.world)) > 1 - 1e-6); }
  const back = await rel(q0, prev), qs = await quat(); const d450 = await dragSnap([cx, cy], dir, 450, 6, 1500), r450 = await rel(qs, await quat());
  cycle[axisName] = { lockAxisWorld: a0.world.map((x) => +x.toFixed(6)), dominantFaceSequence: seq, expectedSet: expectSet, visitsExpected: expectSet.every((f) => seq.slice(0, 4).includes(f)) && new Set(seq.slice(0, 4)).size === 4, returnsAfter360DiffDeg: +back.angleDeg.toFixed(6), steps, oneDrag450: { badgeDeg: d450, relAngleDeg: +r450.angleDeg.toFixed(4) } };
  assert(cycle[axisName].visitsExpected && back.angleDeg < 1e-4 && Math.abs(Math.abs(d450) - 450) < 1e-9 && Math.abs(r450.angleDeg - 90) < 1e-4, `${axisName} 순환`);
}
{ await reset(); if (!(await st()).on) await p.click('#lockToggle'); await p.click('[data-axis=top]'); await p.click('[data-view=top]'); await p.waitForTimeout(100);
  const a0 = await st(), [cx, cy] = await centerXY(), q0 = await quat(), Rpx = 60; await p.mouse.move(cx + Rpx, cy); await p.mouse.down(); await p.keyboard.down('Control'); let d = 0, i = 0;
  for (; i < 800; i++) { const phi = -(i * 4 * Math.PI) / 180; await p.mouse.move(cx + Rpx * Math.cos(phi), cy + Rpx * Math.sin(phi)); d = await badgeDeg(); if (d !== null && Math.abs(d) >= 360) break; }
  await p.keyboard.up('Control'); await p.mouse.up(); const r = await rel(q0, await quat()); await shot('26c_top_axis_circle.png');
  cycle.top = { lockAxisWorld: a0.world.map((x) => +x.toFixed(6)), circleBadgeDeg: d, afterReleaseDiffDeg: +r.angleDeg.toFixed(6), dominantAfter: (await visible()).dominant }; assert(Math.abs(Math.abs(d) - 360) < 1e-9 && r.angleDeg < 1e-4 && cycle.top.dominantAfter === 'lid_top'); }
rec('4_cycles', cycle);

// ===== 5. 면 클릭 ↔ 버튼: 같은 축 상태 공유(마지막 선택 우선)
await reset(); await p.click('[data-axis=right]'); const viaBtn = await st(); await p.click('[data-view=front]'); const [fx, fy] = await faceCenter('lid_front'); await p.mouse.click(fx, fy); const viaFace = await st();
await p.click('[data-axis=iso]'); const viaBtn2 = await st(); const [tx, ty] = await (async () => { await p.click('[data-view=top]'); return faceCenter('lid_top'); })(); await p.mouse.click(tx, ty); const viaFace2 = await st();
const trueKeys = (a) => Object.keys(a.pressed).filter((k) => a.pressed[k]).sort();
rec('5_face_click_and_buttons_share_state', { button_right: { view: viaBtn.view, face: viaBtn.face, pressed: trueKeys(viaBtn) }, thenFaceClick_lid_front: { view: viaFace.view, face: viaFace.face, pressed: trueKeys(viaFace), local: viaFace.local, hint: viaFace.hint, selectedEditFace: viaFace.selected }, button_iso: { view: viaBtn2.view, face: viaBtn2.face, pressed: trueKeys(viaBtn2) }, thenFaceClick_lid_top: { view: viaFace2.view, face: viaFace2.face, pressed: trueKeys(viaFace2), hint: viaFace2.hint } });
assert(viaBtn.view === 'right' && viaBtn.face === null && JSON.stringify(trueKeys(viaBtn)) === JSON.stringify(['left', 'right']));
assert(viaFace.face === 'lid_front' && viaFace.view === null && JSON.stringify(trueKeys(viaFace)) === JSON.stringify(['back', 'front']) && Math.abs(Math.abs(viaFace.local[2]) - 1) < 1e-9 && viaFace.hint.includes('기준 축으로 돕니다.'));
assert(viaBtn2.view === 'iso' && viaBtn2.face === null && JSON.stringify(trueKeys(viaBtn2)) === JSON.stringify(['iso']) && viaFace2.face === 'lid_top' && viaFace2.view === null && JSON.stringify(trueKeys(viaFace2)) === JSON.stringify(['bottom', 'top']));

// ===== 6. 시점 버튼·F 뒤에도 잠금과 선택한 축 유지(새 자세에서 다시 계산), 끄면 줄 숨김·자유 회전, 새로고침 후 꺼짐
await reset(); await p.click('[data-axis=front]'); const keep = [];
for (const [n, sel] of [['front', '[data-view=front]'], ['left', '[data-view=left]'], ['top', '[data-view=top]'], ['bottom', '[data-view=bottom]'], ['iso', '#btnIso']]) { await setPose([0.5, 0.2, -0.4, 0.74]); await p.click(sel); const a = await st(); keep.push({ view: n, lockOn: a.on, lockView: a.view, pressed: trueKeys(a), poseIdentity: (await quat()).every((x, i) => Math.abs(x - [0, 0, 0, 1][i]) < 1e-9), worldAxis: a.world.map((x) => +x.toFixed(6)) }); }
await setPose([0.5, 0.2, -0.4, 0.74]); await p.mouse.click(...(await p.bgPoint())); await p.keyboard.press('f'); await p.waitForTimeout(100); const afterF = await st(), expF = await rotate([0.5, 0.2, -0.4, 0.74], [0, 0, 1]);
rec('6_kept_across_views_and_F', { views: keep, F: { lockOn: afterF.on, lockView: afterF.view, worldAxisMatchesPose: maxDiffUpToSign(afterF.world, expF) < 1e-9, poseKept: (await quat()).some((x, i) => Math.abs(x - [0, 0, 0, 1][i]) > 1e-3) } });
assert(keep.every((r) => r.lockOn && r.lockView === 'front' && r.poseIdentity && JSON.stringify(r.pressed) === JSON.stringify(['back', 'front']) && Math.abs(r.worldAxis[2] - 1) < 1e-9)); assert(afterF.on && afterF.view === 'front' && results['6_kept_across_views_and_F'].F.worldAxisMatchesPose && results['6_kept_across_views_and_F'].F.poseKept);
await p.click('#lockToggle'); const off = await st(); const qf = await quat(); await drag([700, 450], [760, 500], 6); const freeAfterOff = JSON.stringify(qf) !== JSON.stringify(await quat());
rec('6_toggle_off', { rowHidden: off.rowHidden, on: off.on, view: off.view, hls: off.hls, line: off.line, hint: off.hint, freeRotationAfterOff: freeAfterOff }); assert(off.rowHidden && !off.on && off.view === null && off.hls.length === 0 && !off.line && freeAfterOff);
await p.click('#lockToggle'); await p.click('[data-axis=top]'); await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(400); const rl = await st(); rec('6_reload', { on: rl.on, rowHidden: rl.rowHidden, view: rl.view }); assert(!rl.on && rl.rowHidden && rl.view === null);
await colorFaces();

// ===== 7. 표시(축 선·하이라이트·배지)는 PNG·GLB에 들어가지 않는다
await reset(); await p.click('#lockToggle'); await p.click('[data-axis=front]'); await setPose([0.3, 0.45, 0.2, 0.82]); await p.waitForTimeout(150);
const onS = await st(); await shot('26c_overlays_on.png');
const pngOf = async () => { const [d] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => document.getElementById('btnPng').click())]); const f = path.join(OUT, 'png_tmp.png'); await d.saveAs(f); return fs.readFileSync(f); };
const nodes = async (name) => { const b = await p.evaluate(async () => Array.from(new Uint8Array(await window.__sabari.viewer.exportGLB()))).then((a) => Buffer.from(a)); fs.writeFileSync(path.join(OUT, name), b); const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8')); return { nodes: j.nodes, names: j.nodes.map((n) => n.name ?? ''), meshes: j.meshes.length }; };
const pOn = await pngOf(), gOn = await nodes('glb_axisbtn_on.glb'); await p.click('#lockToggle'); const offS = await st(), pOff = await pngOf(), gOff = await nodes('glb_axisbtn_off.glb'); fs.rmSync(path.join(OUT, 'png_tmp.png'), { force: true });
const val = spawnSync(process.execPath, [path.join(ROOT, 'e2e', 'validate_glb.mjs'), path.join(OUT, 'glb_axisbtn_on.glb')], { encoding: 'utf8' }); const vj = JSON.parse(val.stdout.slice(val.stdout.indexOf('{')));
rec('7_overlays_excluded', { visualsOn: { hls: onS.hls, line: onS.line }, visualsOff: { hls: offS.hls, line: offS.line }, pngBytesEqual: Buffer.compare(pOn, pOff) === 0, glbNodesEqual: JSON.stringify(gOn.nodes) === JSON.stringify(gOff.nodes), meshCountEqual: gOn.meshes === gOff.meshes, overlayNames: gOn.names.filter((n) => n.startsWith('__')), validator: vj.validator });
assert(onS.hls.length === 4 && onS.line && offS.hls.length === 0 && !offS.line && Buffer.compare(pOn, pOff) === 0 && results['7_overlays_excluded'].glbNodesEqual && results['7_overlays_excluded'].meshCountEqual && results['7_overlays_excluded'].overlayNames.length === 0 && vj.validator.errors + vj.validator.warnings === 0);

// ===== 8. GLB 뷰어 모드: 템플릿 GLB는 7개 버튼 동작, 면 이름이 없는 외부 GLB는 토글·줄 비활성
await reset(); const tpl = path.join(OUT, 'viewer_template.glb'); const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btnGlb')]); await dl.saveAs(tpl);
const raw = fs.readFileSync(tpl), jl = raw.readUInt32LE(12); const json = raw.subarray(20, 20 + jl).toString('utf8').replace(/"name":"lid_/g, '"name":"xid_').replace(/"name":"base_/g, '"name":"xase_'); fs.writeFileSync(path.join(OUT, 'viewer_external.glb'), Buffer.concat([raw.subarray(0, 20), Buffer.from(json, 'utf8'), raw.subarray(20 + jl)]));
const vm = {}; await p.setInputFiles('#fileGlb', tpl); await p.waitForFunction(() => document.getElementById('glbInfo').textContent.includes('메')); await p.waitForTimeout(300);
await p.click('#lockToggle'); const vs = await st(); await p.click('[data-axis=front]'); const vs2 = await st(); const q0 = await quat(), [cx, cy] = await centerXY().catch(async () => p.evaluate(() => { const v = window.__sabari.viewer, c = v.models.viewer.pivot.getWorldPosition(v.camera.position.clone()).project(v.camera), r = v.renderer.domElement.getBoundingClientRect(); return [r.left + (c.x * 0.5 + 0.5) * r.width, r.top + (-c.y * 0.5 + 0.5) * r.height]; }));
vm.template = { rowShown: !vs.rowHidden, rowEnabled: !vs.rowDisabled, axisAfterFront: vs2.local, pressed: trueKeys(vs2) };
const [vcx, vcy] = await p.evaluate(() => { const v = window.__sabari.viewer, c = v.models.viewer.pivot.getWorldPosition(v.camera.position.clone()).project(v.camera), r = v.renderer.domElement.getBoundingClientRect(); return [r.left + (c.x * 0.5 + 0.5) * r.width, r.top + (-c.y * 0.5 + 0.5) * r.height]; }); void cx; void cy;
await drag([vcx + 40, vcy + 20], [vcx + 90, vcy + 20], 8); const rv = await rel(q0, await quat()); vm.template.lockedRotation = { angleDeg: +rv.angleDeg.toFixed(3), axisAbsDot: +Math.abs(dot(rv.axis, vs2.world)).toFixed(9) };
await p.setInputFiles('#fileGlb', path.join(OUT, 'viewer_external.glb')); await p.waitForFunction(() => document.getElementById('glbInfo').textContent.includes('메')); await p.waitForTimeout(300); const es = await st(); const tg = await p.evaluate(() => ({ toggleDisabled: document.getElementById('lockToggle').disabled }));
vm.external = { toggleDisabled: tg.toggleDisabled, lockOn: es.on, rowShownDisabled: !es.rowHidden && es.rowDisabled, hint: es.hint };
await p.click('#btnExtGlbBack'); const bk = await st(); vm.backToEditor = { toggleEnabled: !(await p.evaluate(() => document.getElementById('lockToggle').disabled)), lockOn: bk.on, rowHidden: bk.rowHidden };
rec('8_glb_viewer_mode', vm);
assert(vm.template.rowShown && vm.template.rowEnabled && Math.abs(Math.abs(vm.template.axisAfterFront[2]) - 1) < 1e-9 && vm.template.lockedRotation.angleDeg > 3 && vm.template.lockedRotation.axisAbsDot > 1 - 1e-6);
assert(vm.external.toggleDisabled && !vm.external.lockOn && vm.external.rowShownDisabled && vm.external.hint.includes('면을 알 수 없어') && vm.backToEditor.toggleEnabled && vm.backToEditor.rowHidden);
await finish('stage26c.json');

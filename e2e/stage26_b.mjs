// 단계 26 축 잠금 검증 (2/2): 표시 제외(PNG·GLB)·시점/F 후 유지·새로고침·GLB 뷰어(템플릿/외부)·잠금 중 기존 조작. 결과: verification/stage26/stage26_b.json
// 사용: STAGE_OUT=verification/stage26 SABARI_URL=http://127.0.0.1:8874/ node e2e/stage26_b.mjs
import { spawnSync } from 'node:child_process';
import { OUT, ROOT, assert, dot, fs, path, start } from './stage24_common.mjs';
const { context, p, rec, results, H, quat, camAxes, camDist, rel, drag, reset, visible, shot, faceCenter, colorFaces, finish } = await start();
await colorFaces();
const lockState = () => p.evaluate(() => { const v = window.__sabari.viewer, a = v.getLockAxisLocal(), w = v.getLockAxisWorld(), h = document.getElementById('lockHint'); return { on: v.isLockOn(), face: v.getLockFace(), local: a ? a.toArray() : null, world: w ? w.toArray() : null, hint: h.hidden ? '' : h.textContent, disabled: document.getElementById('lockToggle').disabled, pressed: document.getElementById('lockToggle').getAttribute('aria-pressed'), selected: v.selected, lockHlOn: v.lockHls.some((o) => o.parent?.name === v.getLockFace()), lockLineOn: !!v.lockLine }; });
const pick = async (id) => { const [x, y] = await faceCenter(id); await p.mouse.click(x, y); return lockState(); };
const scanFace = (name) => p.evaluate((want) => { const v = window.__sabari.viewer, m = v.debugIdMap(), { w, h, data, names } = m, r = v.renderer.domElement.getBoundingClientRect(), k = w / r.width, idx = names.indexOf(want) + 1; const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : data[(y * w + x) * 4]); for (let y = 3; y < h - 3; y += 2) for (let x = 3; x < w - 3; x += 2) if (idx && at(x, y) === idx && at(x - 2, y) === idx && at(x + 2, y) === idx && at(x, y - 2) === idx && at(x, y + 2) === idx) return [r.left + x / k, r.top + y / k]; return null; }, name);

// ===== F. 표시(면 테두리·축 선·배지)는 PNG·GLB에 들어가지 않는다
await reset(); await p.click('#lockToggle'); await pick('lid_top');
await p.evaluate(() => { const v = window.__sabari.viewer; v.setBoxQuat(new v.boxQuat.constructor(0.3, 0.45, 0.2, 0.82)); }); await p.waitForTimeout(150);
const onS = await lockState(); await shot('F_lock_visuals_on.png');
const pngOf = async () => { const [d] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => document.getElementById('btnPng').click())]); const f = path.join(OUT, 'png_tmp.png'); await d.saveAs(f); return fs.readFileSync(f); };
const exportNodes = async (name) => { const buf = await p.evaluate(async () => Array.from(new Uint8Array(await window.__sabari.viewer.exportGLB()))).then((a) => Buffer.from(a)); fs.writeFileSync(path.join(OUT, name), buf); const j = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8')); return { nodes: j.nodes, names: j.nodes.map((n) => n.name ?? ''), meshes: j.meshes.length, buf }; };
const pngOn = await pngOf(), glbOn = await exportNodes('glb_lock_on.glb');
await p.evaluate(() => window.__sabari.viewer.setAxisLock(false)); await p.waitForTimeout(100);
const offS = await lockState(), pngOff = await pngOf(), glbOff = await exportNodes('glb_lock_off.glb'); fs.rmSync(path.join(OUT, 'png_tmp.png'), { force: true });
const val = spawnSync(process.execPath, [path.join(ROOT, 'e2e', 'validate_glb.mjs'), path.join(OUT, 'glb_lock_on.glb')], { encoding: 'utf8' }); const valJson = JSON.parse(val.stdout.slice(val.stdout.indexOf('{')));
rec('F_overlays_excluded', { visualsWereOn: { hl: onS.lockHlOn, line: onS.lockLineOn }, visualsAfterOff: { hl: offS.lockHlOn, line: offS.lockLineOn }, pngBytesEqualLockOnOff: Buffer.compare(pngOn, pngOff) === 0, pngBytes: pngOn.length, glbNodesEqual: JSON.stringify(glbOn.nodes) === JSON.stringify(glbOff.nodes), meshCountEqual: glbOn.meshes === glbOff.meshes, overlayNamesInGlb: glbOn.names.filter((n) => n.startsWith('__')), validator: valJson.validator });
assert(onS.lockHlOn && onS.lockLineOn && !offS.lockHlOn && !offS.lockLineOn); assert(results.F_overlays_excluded.pngBytesEqualLockOnOff && results.F_overlays_excluded.glbNodesEqual && results.F_overlays_excluded.meshCountEqual && results.F_overlays_excluded.overlayNamesInGlb.length === 0 && valJson.validator.errors + valJson.validator.warnings === 0);

// ===== H. 시점 버튼·F 뒤에도 잠금·선택한 면 유지, 축은 새 자세에서 다시 계산, 새로고침 후 꺼짐
await reset(); await p.click('#lockToggle'); await pick('lid_top'); const hs = [];
for (const [name, sel] of [['front', '[data-view=front]'], ['back', '[data-view=back]'], ['left', '[data-view=left]'], ['right', '[data-view=right]'], ['top', '[data-view=top]'], ['bottom', '[data-view=bottom]'], ['iso', '#btnIso']]) {
  await p.evaluate(() => { const v = window.__sabari.viewer; v.setBoxQuat(new v.boxQuat.constructor(0.5, 0.2, -0.4, 0.74)); }); const rotatedAxis = (await lockState()).world;
  await p.click(sel); await p.waitForTimeout(80); const st = await lockState(), q = await quat();
  hs.push({ view: name, lockOn: st.on, face: st.face, poseIdentity: q.every((x, i) => Math.abs(x - [0, 0, 0, 1][i]) < 1e-9), axisWorldAfterView: st.world.map((x) => +x.toFixed(6)), axisWorldBeforeView: rotatedAxis.map((x) => +x.toFixed(4)) });
}
await p.evaluate(() => { const v = window.__sabari.viewer; v.setBoxQuat(new v.boxQuat.constructor(0.5, 0.2, -0.4, 0.74)); }); await p.mouse.click(1330, 780); await p.keyboard.press('f'); await p.waitForTimeout(100);
const afterF = await lockState(), qF = await quat(), expectW = await p.evaluate(() => { const v = window.__sabari.viewer; return v.getLockAxisLocal().clone().applyQuaternion(v.boxQuat).toArray(); });
rec('H_lock_kept_across_views', { rows: hs, F: { lockOn: afterF.on, face: afterF.face, poseKept: qF.some((x, i) => Math.abs(x - [0, 0, 0, 1][i]) > 1e-3), axisWorldMatchesPose: Math.max(...afterF.world.map((x, i) => Math.abs(x - expectW[i]))) < 1e-9 } });
assert(hs.every((r) => r.lockOn && r.face === 'lid_top' && r.poseIdentity && Math.abs(r.axisWorldAfterView[1] - 1) < 1e-9)); assert(afterF.on && afterF.face === 'lid_top' && results.H_lock_kept_across_views.F.poseKept && results.H_lock_kept_across_views.F.axisWorldMatchesPose);
await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(400); const afterReload = await lockState();
rec('H_reload_lock_off', afterReload); assert(!afterReload.on && afterReload.face === null && afterReload.pressed === 'false');
await colorFaces();

// ===== K. 잠금 중에도 기존 조작이 정상: 편집 면 선택 불변·Shift+드래그 이미지 이동·이동 모드·휠·Space/가운데/오른쪽 이동·터치·뚜껑·하단·치수 변경
const kk = {}; await reset(); await p.click('#faceList button[data-face=lid_front]'); await p.click('#lockToggle'); const stK = await pick('lid_top'); kk.axisPicked = stK.face; kk.editSelectedUnchanged = stK.selected === 'lid_front';
await p.click('#faceList button[data-face=lid_top]');
const [tx, ty] = await faceCenter('lid_top'); const s0 = await p.evaluate(() => ({ ...window.__sabari.faces.lid_top.state })), qk = await quat();
await p.keyboard.down('Shift'); await drag([tx, ty], [tx + 40, ty - 20], 8); await p.keyboard.up('Shift'); const s1 = await p.evaluate(() => ({ ...window.__sabari.faces.lid_top.state }));
kk.shiftDragMovesImage = s0.offsetX !== s1.offsetX || s0.offsetY !== s1.offsetY; kk.shiftDragKeepsPose = JSON.stringify(qk) === JSON.stringify(await quat()); kk.lockKeptAfterShiftDrag = (await lockState()).face === 'lid_top';
await p.check('#moveMode'); const s2 = await p.evaluate(() => ({ ...window.__sabari.faces.lid_top.state })); await drag([tx, ty], [tx - 30, ty + 15], 6); const s3 = await p.evaluate(() => ({ ...window.__sabari.faces.lid_top.state })); kk.moveModeMovesImage = s2.offsetX !== s3.offsetX || s2.offsetY !== s3.offsetY; await p.uncheck('#moveMode');
const d0 = await camDist(); await p.mouse.move(700, 450); await p.mouse.wheel(0, -400); await p.waitForTimeout(150); kk.wheelZoom = (await camDist()) < d0;
const tg = () => p.evaluate(() => window.__sabari.viewer.controls.target.toArray()); const t0 = await tg(), qa = await quat();
await p.keyboard.down('Space'); await drag([600, 400], [700, 450], 6); await p.keyboard.up('Space'); const t1 = await tg(); await drag([600, 400], [680, 380], 6, { button: 'middle' }); const t2 = await tg(); await drag([600, 400], [560, 440], 6, { button: 'right' }); const t3 = await tg();
const mv = (a, b) => a.some((x, i) => Math.abs(x - b[i]) > 1e-6); kk.pan = { space: mv(t0, t1), middle: mv(t1, t2), right: mv(t2, t3), poseUnchanged: JSON.stringify(qa) === JSON.stringify(await quat()) };
await reset();
const cdp = await context.newCDPSession(p); const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
const [fx, fy] = await faceCenter('lid_top'); await touch('touchStart', [[fx, fy]]); await touch('touchEnd', []); await p.waitForTimeout(100); kk.touchTapKeepsAxis = (await lockState()).face === 'lid_top';
await p.click('[data-view=front]'); const [gx, gy] = await faceCenter('lid_front'); await touch('touchStart', [[gx, gy]]); await touch('touchEnd', []); await p.waitForTimeout(100); kk.touchTapPicksAxis = (await lockState()).face;
const qt0 = await quat(); await touch('touchStart', [[1000, 450]]); for (let i = 1; i <= 12; i++) await touch('touchMove', [[1000 + i * 8, 450 + i * 6]]); await touch('touchEnd', []); await p.waitForTimeout(80); const rt = await rel(qt0, await quat()), axW = (await lockState()).world; kk.touchDragLocked = { angleDeg: +rt.angleDeg.toFixed(3), axisAbsDot: +Math.abs(dot(rt.axis, axW)).toFixed(9) };
const qt1 = await quat(), dd0 = await camDist(); await touch('touchStart', [[900, 450], [1000, 450]]); for (let i = 1; i <= 8; i++) await touch('touchMove', [[900 - i * 12, 450], [1000 + i * 12, 450]]); await touch('touchEnd', []); await p.waitForTimeout(150); kk.pinch = { zoomed: (await camDist()) < dd0, poseUnchanged: JSON.stringify(qt1) === JSON.stringify(await quat()) };
await reset(); await p.click('#btnOpen'); await p.waitForTimeout(100); kk.lidOpenKeepsLock = (await lockState()).on; await p.click('#btnClose');
await p.evaluate(() => { const w = window.__sabari; w.applyParams({ ...w.getParams(), baseH: 60 }); }); await p.waitForTimeout(500); const afterDims = await lockState(); kk.dimsChangeKeepsLockVisuals = afterDims.on && afterDims.face === 'lid_front' && afterDims.lockHlOn && afterDims.lockLineOn;
await p.evaluate(() => { const w = window.__sabari; w.applyParams({ ...w.getParams(), baseH: 43 }); }); await p.waitForTimeout(500);
await p.click('#lockToggle'); await p.check('#useBase'); await p.click('#tab_base'); await p.click('#btnOpen'); await p.click('[data-view=bottom]'); await p.waitForTimeout(150); const [bx, by] = await faceCenter('base_bottom'); await p.mouse.click(bx, by); kk.baseSelectWhenLockOff = await p.evaluate(() => window.__sabari.viewer.selected); await p.click('#btnClose'); await p.click('#tab_lid');
rec('K_other_interactions', kk); fs.writeFileSync(path.join(OUT, 'stage26_b_partial.json'), JSON.stringify(results, null, 2));
assert(kk.axisPicked === 'lid_top' && kk.editSelectedUnchanged && kk.shiftDragMovesImage && kk.shiftDragKeepsPose && kk.lockKeptAfterShiftDrag && kk.moveModeMovesImage && kk.wheelZoom && kk.pan.space && kk.pan.middle && kk.pan.right && kk.pan.poseUnchanged);
assert(kk.touchTapKeepsAxis && kk.touchTapPicksAxis === 'lid_front' && kk.touchDragLocked.angleDeg > 3 && kk.touchDragLocked.axisAbsDot > 1 - 1e-6 && kk.pinch.zoomed && kk.pinch.poseUnchanged && kk.lidOpenKeepsLock && kk.dimsChangeKeepsLockVisuals && kk.baseSelectWhenLockOff === 'base_bottom');

// ===== I. GLB 뷰어 모드: 템플릿 GLB는 축 잠금 가능, 면 이름을 알 수 없는 외부 GLB는 비활성(자유 회전만)
await reset(); const exported = path.join(OUT, 'viewer_template.glb'); const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btnGlb')]); await dl.saveAs(exported);
const raw = fs.readFileSync(exported), jl = raw.readUInt32LE(12); let json = raw.subarray(20, 20 + jl).toString('utf8'); json = json.replace(/"name":"lid_/g, '"name":"xid_').replace(/"name":"base_/g, '"name":"xase_'); // 같은 길이로 면 이름만 바꿔 "면을 알 수 없는" 외부 GLB를 만든다
const ext = Buffer.concat([raw.subarray(0, 20), Buffer.from(json, 'utf8'), raw.subarray(20 + jl)]); fs.writeFileSync(path.join(OUT, 'viewer_external.glb'), ext);
const vm = {}; await p.click('#tabView'); await p.setInputFiles('#fileGlb', exported); await p.waitForFunction(() => document.getElementById('glbInfo').textContent.includes('메')); await p.waitForTimeout(300);
vm.template_toggleEnabled = !(await lockState()).disabled; await p.click('#lockToggle'); const topPt = await scanFace('lid_top'); await p.mouse.click(...topPt); const ts = await lockState(); vm.template_pickedFace = ts.face; vm.template_hint = ts.hint;
const qv0 = await quat(); const [cx, cy] = await p.evaluate(() => { const v = window.__sabari.viewer, c = v.models.viewer.pivot.getWorldPosition(v.camera.position.clone()).project(v.camera), r = v.renderer.domElement.getBoundingClientRect(); return [r.left + (c.x * 0.5 + 0.5) * r.width, r.top + (-c.y * 0.5 + 0.5) * r.height]; });
await drag([cx + 50, cy + 20], [cx + 90, cy + 70], 8); const rv = await rel(qv0, await quat()); vm.template_lockedRotation = { angleDeg: +rv.angleDeg.toFixed(3), axisAbsDot: +Math.abs(dot(rv.axis, ts.world)).toFixed(9) }; await shot('I_viewer_template_locked.png');
await p.setInputFiles('#fileGlb', path.join(OUT, 'viewer_external.glb')); await p.waitForFunction(() => document.getElementById('glbInfo').textContent.includes('메')); await p.waitForTimeout(300);
const es = await lockState(); vm.external = { toggleDisabled: es.disabled, lockOn: es.on, hint: es.hint, pressed: es.pressed };
const qe0 = await quat(); await drag([700, 450], [790, 520], 8); vm.external.freeRotationWorks = JSON.stringify(qe0) !== JSON.stringify(await quat()); await shot('I_viewer_external_free.png');
await p.click('#tabEdit'); const back = await lockState(); vm.backToEditor = { toggleEnabled: !back.disabled, lockOn: back.on };
rec('I_glb_viewer_mode', vm);
assert(vm.template_toggleEnabled && vm.template_pickedFace === 'lid_top' && vm.template_lockedRotation.angleDeg > 3 && vm.template_lockedRotation.axisAbsDot > 1 - 1e-6);
assert(vm.external.toggleDisabled && !vm.external.lockOn && vm.external.hint.includes('면을 알 수 없어') && vm.external.freeRotationWorks && vm.backToEditor.toggleEnabled);
await finish('stage26_b.json');

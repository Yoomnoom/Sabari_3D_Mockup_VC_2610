// 단계 30 각도 바 + 저장된 시점(.sabari 포함) 검증. 결과: verification/stage30/stage30.json
// 사용: STAGE_OUT=verification/stage30 SABARI_URL=http://127.0.0.1:8766/ node e2e/stage30.mjs
import { spawnSync } from 'node:child_process';
import { OUT, ROOT, URL, assert, dot, fs, path, start } from './stage24_common.mjs';
const { p, context, rec, quat, rel, drag, reset, faceCenter, colorFaces, finish } = await start();
await colorFaces();

const near = (a, b, eps) => Math.abs(a - b) <= eps;
const vecClose = (a, b, eps) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= eps);

const st = () => p.evaluate(() => {
  const v = window.__sabari.viewer;
  const b = v.bounds();
  const ax = v.getLockAxisWorld();
  return {
    quat: v.boxQuat.toArray(),
    camPos: v.camera.position.toArray(),
    target: v.controls.target.toArray(),
    fov: v.camera.fov,
    lockOn: v.isLockOn(),
    lockView: v.getLockView(),
    angleDeg: v.getLockAngleDeg(),
    liftMm: v.getLiftMm(),
    axisWorld: ax ? ax.toArray() : null,
    center: [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2],
    fit: v.getFitDistance(),
  };
});
const angleUi = () => p.evaluate(() => ({
  hintHidden: document.getElementById('angleDisabledHint').hidden,
  sliderHidden: document.getElementById('angleSliderRow').hidden,
  btnHidden: document.getElementById('angleBtnRow').hidden,
  r: document.getElementById('angleR').value,
  n: document.getElementById('angleN').value,
}));
const setAngleN = async (v) => { await p.fill('#angleN', String(v)); await p.locator('#angleN').dispatchEvent('change'); };
const cardState = (slot) => p.evaluate((slot) => {
  const c = document.querySelector(`.vp-card[data-slot="${slot}"]`);
  const img = c.querySelector('.vp-thumb img');
  return {
    filled: c.classList.contains('filled'),
    name: c.querySelector('.vp-name').value,
    thumbDisabled: c.querySelector('.vp-thumb').disabled,
    saveDisabled: c.querySelector('.vp-save').disabled,
    delDisabled: c.querySelector('.vp-del').disabled,
    delHidden: c.querySelector('.vp-del').hidden,
    nameDisabled: c.querySelector('.vp-name').disabled,
    imgHidden: img.hidden,
    imgSrcIsBlob: img.src.startsWith('blob:'),
  };
}, slot);
const saveSlot = async (slot) => { await p.click(`.vp-card[data-slot="${slot}"] .vp-save`); await p.waitForFunction((s) => document.querySelector(`.vp-card[data-slot="${s}"]`).classList.contains('filled'), slot); };
const loadSlot = async (slot) => { await p.click(`.vp-card[data-slot="${slot}"] .vp-thumb`); await p.waitForTimeout(120); };
const delSlot = async (slot) => { await p.click(`.vp-card[data-slot="${slot}"] .vp-del`); await p.waitForTimeout(60); };

// ===================== 각도 바 =====================
await reset();
await p.click('#lockToggle');
await p.evaluate(() => { document.getElementById('dAngle').open = true; });
await p.click('[data-axis="right"]');
const baseline = await quat();
const axisWorld0 = (await st()).axisWorld;
rec('A0_axis_select_is_zero', { angleDegAtSelect: (await st()).angleDeg });
assert(Math.abs((await st()).angleDeg) < 1e-9);

await setAngleN(30);
const r30 = await rel(baseline, await quat());
rec('A_plus30', { angleDeg: r30.angleDeg, axisDot: dot(r30.axis, axisWorld0) });
assert(Math.abs(r30.angleDeg - 30) < 1e-6 && dot(r30.axis, axisWorld0) > 1 - 1e-6);

await p.click('#angleZero');
const afterZero = await quat();
rec('B_zero_matches_baseline', { maxAbsDiff: Math.max(...afterZero.map((x, i) => Math.abs(x - baseline[i]))) });
assert(vecClose(afterZero, baseline, 1e-9));

await p.click('#angleBtnRow [data-ang="5"]');
const u1 = await angleUi(); const a1 = (await rel(baseline, await quat())).angleDeg;
await p.click('#angleBtnRow [data-ang="1"]');
const u2 = await angleUi(); const a2 = (await rel(baseline, await quat())).angleDeg;
await p.click('#angleBtnRow [data-ang="-1"]');
const u3 = await angleUi(); const a3 = (await rel(baseline, await quat())).angleDeg;
await p.click('#angleBtnRow [data-ang="-5"]');
const u4 = await angleUi(); const a4 = (await rel(baseline, await quat())).angleDeg;
rec('C_delta_buttons', { afterPlus5: { ui: u1.n, actual: a1 }, afterPlus1: { ui: u2.n, actual: a2 }, afterMinus1: { ui: u3.n, actual: a3 }, afterMinus5: { ui: u4.n, actual: a4 } });
assert(u1.n === '5.0' && near(a1, 5, 1e-6) && u2.n === '6.0' && near(a2, 6, 1e-6) && u3.n === '5.0' && near(a3, 5, 1e-6) && u4.n === '0.0' && near(a4, 0, 1e-6));

await setAngleN(45);
const u5 = await angleUi(); const a5 = (await rel(baseline, await quat())).angleDeg;
rec('D_number_input', { ui: { r: u5.r, n: u5.n }, actual: a5 });
assert(near(parseFloat(u5.r), 45, 1e-6) && u5.n === '45.0' && near(a5, 45, 1e-6));

await p.click('#angleZero');
await drag([700, 450], [760, 400], 10);
const u6 = await angleUi(); const r6 = await rel(baseline, await quat());
const a6 = dot(r6.axis, axisWorld0) >= 0 ? r6.angleDeg : -r6.angleDeg;
rec('E_drag_sync', { ui: u6.n, actual: a6 });
assert(near(parseFloat(u6.n), a6, 0.15));

await p.click('#angleZero');
const H = await p.evaluate(() => document.getElementById('viewport').clientHeight);
const dinfo = await drag([700, 450], [700, 450 + H / 4], 9, { ctrl: true });
const u7 = await angleUi(); const r7 = await rel(baseline, await quat());
const a7 = dot(r7.axis, axisWorld0) >= 0 ? r7.angleDeg : -r7.angleDeg;
rec('F_ctrl_snap_sync', { badge: dinfo.badge, snapClass: dinfo.snapClass, ui: u7.n, actual: a7, multipleOf15: Math.abs(a7 / 15 - Math.round(a7 / 15)) < 1e-6 });
assert(dinfo.snapClass && Math.abs(a7 / 15 - Math.round(a7 / 15)) < 1e-6 && near(parseFloat(u7.n), a7, 0.15));

const beforeAxisChange = await quat();
await p.click('[data-axis="front"]');
const afterAxisChange = await quat();
const u8 = await angleUi();
rec('G_axis_change_resets', { poseUnchanged: vecClose(beforeAxisChange, afterAxisChange, 1e-12), ui: u8.n });
assert(vecClose(beforeAxisChange, afterAxisChange, 1e-12) && u8.n === '0.0');

await setAngleN(10);
await p.click('#lockToggle');
const u9 = await angleUi();
rec('H1_lock_off_disables_rotated', { hintHidden: u9.hintHidden, sliderHidden: u9.sliderHidden, btnHidden: u9.btnHidden });
assert(!u9.hintHidden && u9.sliderHidden && u9.btnHidden);

await p.click('[data-view="top"]');
await p.click('#lockToggle');
await p.click('[data-axis="top"]');
await setAngleN(20);
await p.click('#lockToggle');
const u10 = await angleUi();
rec('H2_lock_off_disables_from_top', { hintHidden: u10.hintHidden, sliderHidden: u10.sliderHidden, btnHidden: u10.btnHidden });
assert(!u10.hintHidden && u10.sliderHidden && u10.btnHidden);

// ===================== 저장된 시점 =====================
await reset();
await p.click('[data-view="front"]');
await p.mouse.move(840, 430); await p.mouse.wheel(0, -500); await p.waitForTimeout(120);
await p.mouse.move(840, 430); await p.keyboard.down('Space'); await p.mouse.down(); await p.mouse.move(900, 470, { steps: 5 }); await p.mouse.up(); await p.keyboard.up('Space');
await p.fill('#liftN', '40'); await p.locator('#liftN').dispatchEvent('change');
await p.click('#lockToggle'); await p.click('[data-axis="left"]'); await setAngleN(12);
const want0 = await st();
await saveSlot(0);
const c0 = await cardState(0);
rec('I0_slot0_saved_state_card', { card: c0, want: want0 });
assert(c0.filled && !c0.imgHidden && c0.imgSrcIsBlob);

await p.click('[data-view="back"]'); await p.click('#lockToggle'); await p.fill('#liftN', '0'); await p.locator('#liftN').dispatchEvent('change');
await loadSlot(0);
const got0 = await st();
rec('I_round_trip_slot0', {
  quatDiff: Math.max(...got0.quat.map((x, i) => Math.abs(x - want0.quat[i]))),
  camDiff: Math.max(...got0.camPos.map((x, i) => Math.abs(x - want0.camPos[i]))),
  targetDiff: Math.max(...got0.target.map((x, i) => Math.abs(x - want0.target[i]))),
  fovDiff: Math.abs(got0.fov - want0.fov),
  lockOn: got0.lockOn, lockView: got0.lockView, angleDeg: got0.angleDeg,
  liftDiff: Math.abs(got0.liftMm - want0.liftMm),
});
assert(vecClose(got0.quat, want0.quat, 1e-9) && vecClose(got0.camPos, want0.camPos, 1e-6) && vecClose(got0.target, want0.target, 1e-6));
assert(Math.abs(got0.fov - want0.fov) < 1e-6 && got0.lockOn === true && got0.lockView === 'left' && near(got0.angleDeg, want0.angleDeg, 1e-6) && Math.abs(got0.liftMm - want0.liftMm) < 0.5);

// 5개 슬롯: 저장/덮어쓰기/이름 변경/삭제/썸네일
await p.click('[data-view="left"]'); await saveSlot(1);
await p.click('[data-view="right"]'); await saveSlot(2);
await p.click('[data-view="top"]'); await saveSlot(3);
const wantSlot3First = await st();
await p.click('[data-view="bottom"]'); await saveSlot(3); // 덮어쓰기
const gotSlot3 = await st(); await loadSlot(3); const reloadedSlot3 = await st();
rec('J_overwrite_slot3', { differsFromFirstSave: !vecClose(wantSlot3First.quat, gotSlot3.quat, 1e-9) || !vecClose(wantSlot3First.camPos, gotSlot3.camPos, 1e-6) });
assert(vecClose(reloadedSlot3.camPos, gotSlot3.camPos, 1e-6));

await p.fill('.vp-card[data-slot="1"] .vp-name', '내 시점 1');
await p.locator('.vp-card[data-slot="1"] .vp-name').dispatchEvent('change');
await p.click('[data-view="iso"]'); await saveSlot(4);
const renameCheck = await cardState(1);
rec('J_rename_slot1', { name: renameCheck.name });
assert(renameCheck.name === '내 시점 1');

const beforeDel = await cardState(2);
await delSlot(2);
const afterDel = await cardState(2);
rec('J_delete_slot2', { before: beforeDel, after: afterDel });
assert(beforeDel.filled && !afterDel.filled && afterDel.delHidden && afterDel.imgHidden && afterDel.name === '시점 3');

const thumbs = {};
for (const s of [0, 1, 3, 4]) thumbs[s] = await cardState(s);
rec('J_thumbnails', thumbs);
assert([0, 1, 3, 4].every((s) => thumbs[s].filled && !thumbs[s].imgHidden && thumbs[s].imgSrcIsBlob));

// 치수가 바뀌어도 같은 구도(슬롯0)
await loadSlot(0);
const before0 = await st();
const ratioBefore = Math.hypot(...before0.camPos.map((x, i) => x - before0.center[i])) / before0.fit;
const dirBefore = before0.camPos.map((x, i) => (x - before0.center[i]));
const nb = Math.hypot(...dirBefore); const dirBeforeN = dirBefore.map((x) => x / nb);
await p.evaluate(() => { const pr = window.__sabari.getParams(); window.__sabari.applyParams({ ...pr, baseH: 70 }); });
await p.waitForTimeout(100);
await loadSlot(0);
const after0 = await st();
const ratioAfter = Math.hypot(...after0.camPos.map((x, i) => x - after0.center[i])) / after0.fit;
const dirAfter = after0.camPos.map((x, i) => (x - after0.center[i]));
const na = Math.hypot(...dirAfter); const dirAfterN = dirAfter.map((x) => x / na);
rec('K_dimension_change_keeps_framing', { ratioBefore, ratioAfter, axisDot: dot(dirBeforeN, dirAfterN), quatSame: vecClose(after0.quat, want0.quat, 1e-9) });
assert(Math.abs(ratioAfter - ratioBefore) < 1e-6 && dot(dirBeforeN, dirAfterN) > 1 - 1e-6 && vecClose(after0.quat, want0.quat, 1e-9));
await p.evaluate(() => { const pr = window.__sabari.getParams(); window.__sabari.applyParams({ ...pr, baseH: 43 }); });
await p.waitForTimeout(100);

// 외부 GLB를 보는 중에는 비활성
await p.setInputFiles('#fileGlb', path.join(ROOT, 'e2e', 'fixtures', 'legacy_5face.glb'));
await p.waitForFunction(() => document.getElementById('glbInfo').textContent.includes('메시'));
const duringGlb = await cardState(0); const duringGlbEmpty = await cardState(2);
rec('L_external_glb_disables', { filledSlot: duringGlb, emptySlot: duringGlbEmpty });
assert(duringGlb.thumbDisabled && duringGlb.saveDisabled && duringGlb.delDisabled && duringGlb.nameDisabled);
assert(duringGlbEmpty.thumbDisabled && duringGlbEmpty.saveDisabled);
await p.click('#btnExtGlbBack');
await p.waitForTimeout(100);
const afterReturn = await cardState(0);
rec('L_return_reenables', afterReturn);
assert(!afterReturn.thumbDisabled && !afterReturn.saveDisabled);

// Alt+1~5 단축키
await p.click('[data-view="back"]');
await p.mouse.click(1000, 700);
await p.keyboard.press('Alt+Digit1');
await p.waitForTimeout(100);
const viaAlt1 = await st();
rec('M_alt1_loads_slot0', { camDiff: Math.max(...viaAlt1.camPos.map((x, i) => Math.abs(x - want0.camPos[i]))) });
assert(vecClose(viaAlt1.camPos, want0.camPos, 1e-6) && vecClose(viaAlt1.quat, want0.quat, 1e-9));

const beforeAltEmpty = await st();
await p.keyboard.press('Alt+Digit3'); // 슬롯 인덱스 2(삭제됨) = Digit3
await p.waitForTimeout(80);
const afterAltEmpty = await st();
rec('M_alt_on_empty_slot_noop', { unchanged: vecClose(beforeAltEmpty.camPos, afterAltEmpty.camPos, 1e-9) });
assert(vecClose(beforeAltEmpty.camPos, afterAltEmpty.camPos, 1e-9));

// ===================== .sabari 저장/복원 =====================
fs.mkdirSync(OUT, { recursive: true });
const [d1] = await Promise.all([p.waitForEvent('download'), p.click('#btnProjSave')]);
const sabariPath = path.join(OUT, 'stage30.sabari');
await d1.saveAs(sabariPath);
const { default: JSZip } = await import('../frontend/node_modules/jszip/lib/index.js');
const zip = await JSZip.loadAsync(fs.readFileSync(sabariPath));
const proj = JSON.parse(await zip.file('project.json').async('string'));
const vpThumbFiles = proj.viewPresets.filter((v) => v.thumbFile).map((v) => v.thumbFile);
rec('N_sabari_schema', {
  schemaVersion: proj.schemaVersion,
  slots: proj.viewPresets.map((v) => ({ slot: v.slot, name: v.name, hasThumbFile: !!v.thumbFile })),
  allThumbFilesInZip: vpThumbFiles.every((f) => !!zip.files[f]),
  projectJsonBytes: JSON.stringify(proj).length,
});
// 작업 13: 배경 설정(viewSettings)을 넣어 schemaVersion이 5 → 6, 작업 25: 스튜디오 배경으로 6 → 7
assert(proj.schemaVersion === 12 && proj.viewPresets.length === 4 && vpThumbFiles.every((f) => !!zip.files[f]));
assert(proj.viewPresets.find((v) => v.slot === 1).name === '내 시점 1');
assert(JSON.stringify(proj).length < 20000); // 썸네일이 base64로 들어가면 훨씬 커진다

// 임시저장
await p.click('#btnDraftSave'); await p.waitForTimeout(400);
await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(400);
await p.waitForFunction(() => !document.getElementById('btnDraftLoad').disabled);
await p.click('#btnDraftLoad'); await p.waitForTimeout(500);
const draftCards = {}; for (const s of [0, 1, 2, 3, 4]) draftCards[s] = await cardState(s);
await loadSlot(0); const draftSlot0 = await st();
rec('O_draft_round_trip', { cards: draftCards, camDiff: Math.max(...draftSlot0.camPos.map((x, i) => Math.abs(x - want0.camPos[i]))) });
assert(draftCards[0].filled && draftCards[1].filled && !draftCards[2].filled && draftCards[3].filled && draftCards[4].filled && draftCards[1].name === '내 시점 1');
assert(vecClose(draftSlot0.camPos, want0.camPos, 1e-6));

// 새 컨텍스트(새로고침)에서 .sabari 열기로 복원
await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(400);
await p.setInputFiles('#fileProj', sabariPath); await p.waitForTimeout(600);
const reopenCards = {}; for (const s of [0, 1, 2, 3, 4]) reopenCards[s] = await cardState(s);
await loadSlot(0); const reopenSlot0 = await st();
rec('P_sabari_reopen_round_trip', { cards: reopenCards, camDiff: Math.max(...reopenSlot0.camPos.map((x, i) => Math.abs(x - want0.camPos[i]))) });
assert(reopenCards[0].filled && reopenCards[1].filled && !reopenCards[2].filled && reopenCards[1].name === '내 시점 1');
assert(vecClose(reopenSlot0.camPos, want0.camPos, 1e-6) && vecClose(reopenSlot0.quat, want0.quat, 1e-9));

// 기존(v2/v3, viewPresets 필드 없음) 파일은 빈 슬롯으로 열린다
await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(400);
await p.setInputFiles('#fileProj', path.join(ROOT, 'e2e', 'fixtures', 'legacy_v3_10face.sabari')); await p.waitForTimeout(700);
const legacyCards = {}; for (const s of [0, 1, 2, 3, 4]) legacyCards[s] = await cardState(s);
const legacyMsg = await p.textContent('#msgText');
rec('Q_legacy_file_empty_presets', { cards: legacyCards, msg: legacyMsg });
assert([0, 1, 2, 3, 4].every((s) => !legacyCards[s].filled));

// 미래 버전은 거부 (거부 시 UserError가 pageerror로도 올라오므로 별도 페이지에서 확인하고 그 오류는 finish()의 집계에 넣지 않는다 - base10.mjs의 9_future_version 관례와 동일)
const p2 = await context.newPage(); const p2errors = [];
p2.on('pageerror', (e) => p2errors.push(String(e)));
await p2.goto(URL); await p2.waitForFunction(() => window.__sabari);
await p2.setInputFiles('#fileProj', path.join(ROOT, 'e2e', 'fixtures', 'future_v99.sabari')); await p2.waitForTimeout(400);
const futureMsg = await p2.textContent('#msgText');
rec('R_future_version_rejected', { msg: futureMsg, pageErrors: p2errors });
assert(futureMsg.includes('업데이트'));
await p2.close();

// GLB·PNG 불변(validator 0/0)
await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(400);
await p.setInputFiles('#fileProj', sabariPath); await p.waitForTimeout(600);
const [g] = await Promise.all([p.waitForEvent('download'), p.click('#btnGlb')]);
const glbPath = path.join(OUT, 'stage30.glb'); await g.saveAs(glbPath);
const val = spawnSync(process.execPath, [path.join(ROOT, 'e2e', 'validate_glb.mjs'), glbPath], { encoding: 'utf8' });
const valJson = JSON.parse(val.stdout.slice(val.stdout.indexOf('{')));
const [pg] = await Promise.all([p.waitForEvent('download'), p.click('#btnPng')]);
const pngPath = path.join(OUT, 'stage30.png'); await pg.saveAs(pngPath);
rec('S_glb_png_invariant', { validator: valJson.validator, glbBytes: fs.statSync(glbPath).size, pngBytes: fs.statSync(pngPath).size });
assert(valJson.validator.errors === 0 && valJson.validator.warnings === 0);

await finish('stage30.json');

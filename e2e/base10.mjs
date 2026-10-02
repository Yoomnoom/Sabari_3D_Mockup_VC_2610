// 하단 몸통 5면(선택 기능) 검증: SABARI_URL=http://127.0.0.1:8766/ node e2e/base10.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), V = path.join(ROOT, 'verification'), S = path.join(ROOT, 'assets', 'samples'), FX = path.join(ROOT, 'e2e', 'fixtures');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
const LID = ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right'];
const BASE = ['base_front', 'base_back', 'base_left', 'base_right', 'base_bottom'];
const R = {}; const rec = (k, v) => { R[k] = v; };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const newPage = async (ctx) => { const p = await ctx.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(String(e))); await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(250); return p; };
const faceBtns = (p) => p.evaluate(() => [...document.querySelectorAll('#faceList button')].map((x) => x.dataset.face));
const imgs = (p, ids) => p.evaluate((ids) => ids.filter((id) => window.__sabari.faces[id].img), ids);
const putImage = async (p, id, file) => { await p.evaluate((id) => window.__sabari.setCurrent(id), id); await p.setInputFiles('#filePick', file); await p.waitForFunction((id) => window.__sabari.faces[id].img, id); };

const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const p = await newPage(ctx);

// ===== 1. 기본 꺼짐: 화면·동작이 이전과 같다 =====
rec('1_default_switch_off', !(await p.isChecked('#useBase')));
rec('1_tabs_hidden', await p.isHidden('#faceTabs'));
rec('1_face_list', await faceBtns(p)); // 뚜껑 5면만
rec('1_base_select_blocked_by_code', await p.evaluate(() => { window.__sabari.setCurrent('base_front'); return window.__sabari.viewer.selected; })); // lid_top 유지
rec('1_below_view_available_while_off', await p.isVisible('[data-view=bottom]'));
await p.click('[data-view=bottom]'); rec('1_below_view_dir', await p.evaluate(() => { const v = window.__sabari.viewer, t = v.controls.target; return v.camera.position.toArray().map((n, i) => +(n - t.toArray()[i]).toFixed(2)).join(','); }));
// 기존 5면 흐름 후 GLB: 이미지 5개
for (const f of LID) await putImage(p, f, path.join(S, `sample_${f}.png`));
rec('1_lid_images', (await imgs(p, LID)).length);
const [d1] = await Promise.all([p.waitForEvent('download'), p.click('#btnGlb')]); const glb5 = path.join(V, 'base10_default_off.glb'); await d1.saveAs(glb5);
// 안전망: 꺼짐에서 .sabari 저장 시 하단 이미지 없음
const [pj1] = await Promise.all([p.waitForEvent('download'), p.click('#btnProjSave')]); const proj5 = path.join(V, 'base10_default_off.sabari'); await pj1.saveAs(proj5);
await p.screenshot({ path: path.join(V, '21_base_off.png') });

// ===== 2. 스위치 ON: 10면에 고유 색 이미지 =====
await p.check('#useBase');
rec('2_tabs_visible', await p.isVisible('#faceTabs'));
await p.click('#tab_base'); rec('2_base_list', await faceBtns(p));
rec('2_tab_counts', await p.evaluate(() => [document.getElementById('tab_lid').textContent, document.getElementById('tab_base').textContent]));
rec('2_notice_when_closed', { visible: await p.isVisible('#openNotice'), text: await p.textContent('#openNoticeText') });
for (const f of BASE) await putImage(p, f, path.join(S, `sample_${f}.png`));
rec('2_all_10', (await imgs(p, [...LID, ...BASE])).length);
// 닫힌 상태에서 하단 면을 "클릭"해도 안 보이는 곳이니 코드로 선택 후 선택선·클릭 선택은 열린 상태에서 확인
await p.click('#btnNoticeOpen'); rec('2_notice_open_button_opens', await p.evaluate(() => window.__sabari.viewer.getLiftMm()));
rec('2_notice_hidden_when_open', await p.isHidden('#openNotice'));
await p.click('#btnClose'); rec('2_notice_not_auto_opened_again', await p.evaluate(() => window.__sabari.viewer.getLiftMm()) === 0);
await p.click('#btnOpen');
await p.click('[data-view=bottom]');
await p.screenshot({ path: path.join(V, '22_base_below.png') });

// 번짐 측정 (색 hue로 분류, 면 투영 다각형 밖에 있는 픽셀 수)
const analyze = (cam) => p.evaluate(async ({ cam }) => {
  const S = window.__sabari, v = S.viewer; v.setCameraRaw(cam.pos, cam.target); await new Promise((r) => setTimeout(r, 160));
  const bmp = await createImageBitmap(await v.screenshot('white')); const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
  const data = g.getImageData(0, 0, bmp.width, bmp.height).data; const k = bmp.width / v.renderer.domElement.clientWidth;
  const hue = (r, gg, b) => { const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); if (mx < 60 || (mx - mn) / mx < 0.5) return null; const d = mx - mn; let h = mx === r ? ((gg - b) / d + 6) % 6 : mx === gg ? (b - r) / d + 2 : (r - gg) / d + 4; return h * 60; };
  // 각 샘플 이미지의 실제 배경색에서 계산한 hue. 가장 가까운 면(±9°)으로 분류한다. (이 PNG들은 assets/samples 의 배경색 그대로)
  const COL = { lid_top: [214, 40, 40], lid_front: [30, 100, 220], lid_back: [30, 160, 70], lid_left: [0, 160, 170], lid_right: [130, 50, 190], base_front: [240, 120, 20], base_back: [60, 40, 255], base_left: [220, 40, 170], base_right: [230, 40, 100], base_bottom: [140, 200, 20] };
  const HUES = Object.entries(COL).map(([id, c]) => [id, hue(...c)]);
  const cls = (h) => { if (h == null) return null; let best = null, bd = 999; for (const [id, hh] of HUES) { const dd = Math.min(Math.abs(h - hh), 360 - Math.abs(h - hh)); if (dd < bd) { bd = dd; best = id; } } return bd <= 9 ? best : null; };
  const polys = {}; for (const id of Object.keys(S.faces)) polys[id] = v.faceCorners(id).map(([x, y]) => [x * k, y * k]);
  const inside = (p, [x, y], tol) => { let pos = 0, neg = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; const len = Math.hypot(x2 - x1, y2 - y1) || 1; const cr = ((x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)) / len; if (cr > tol) pos++; else if (cr < -tol) neg++; } return !(pos && neg); };
  const count = {}, bleed = {};
  for (let y = 0; y < bmp.height; y += 2) for (let x = 0; x < bmp.width; x += 2) { const i = (y * bmp.width + x) * 4; if (data[i + 3] < 250) continue; const id = cls(hue(data[i], data[i + 1], data[i + 2])); if (!id) continue; count[id] = (count[id] ?? 0) + 1; if (!inside(polys[id], [x, y], -4 * k / 2 - 2)) bleed[id] = (bleed[id] ?? 0) + 1; }
  return { count, bleed };
}, { cam });
const cy = 0.045, dist = 0.5;
const cams = {
  open_iso_front_right: { pos: [0.35, 0.22, 0.38], target: [0, 0.04, 0] }, open_iso_back_left: { pos: [-0.35, 0.22, -0.38], target: [0, 0.04, 0] },
  open_iso_front_left: { pos: [-0.38, 0.1, 0.35], target: [0, 0.04, 0] }, open_iso_back_right: { pos: [0.38, 0.1, -0.35], target: [0, 0.04, 0] },
  low_front: { pos: [0, 0.03, 0.5], target: [0, 0.03, 0] }, low_back: { pos: [0, 0.03, -0.5], target: [0, 0.03, 0] },
  low_left: { pos: [-0.5, 0.03, 0], target: [0, 0.03, 0] }, low_right: { pos: [0.5, 0.03, 0], target: [0, 0.03, 0] },
  from_below: { pos: [0.001, -0.5, 0.0001], target: [0, 0.03, 0] }, from_below_oblique: { pos: [0.3, -0.3, 0.3], target: [0, 0.03, 0] },
};
const bleed = {}; for (const [n, c] of Object.entries(cams)) bleed[n] = await analyze(c);
rec('2_bleed', bleed);
rec('2_bleed_total_px', Object.values(bleed).flatMap((r) => Object.values(r.bleed)).reduce((a, x) => a + x, 0));
const seen = new Set(Object.values(bleed).flatMap((r) => Object.keys(r.count))); rec('2_faces_seen_in_samples', [...seen].sort());
await p.screenshot({ path: path.join(V, '23_base_open_iso.png') });

// 하단 면 클릭 선택 + 선택선 (열린 상태)
await p.evaluate((c) => window.__sabari.viewer.setCameraRaw(c.pos, c.target), { pos: [0, 0.03, 0.42], target: [0, 0.03, 0] }); await p.waitForTimeout(150);
await p.evaluate(() => window.__sabari.viewer.setHighlightOn(false));
const front = await p.evaluate(() => { const v = window.__sabari.viewer; const pts = v.faceCorners('base_front'); const cx = pts.reduce((s, q) => s + q[0], 0) / 4, cy = pts.reduce((s, q) => s + q[1], 0) / 4; const r = v.renderer.domElement.getBoundingClientRect(); return [r.left + cx, r.top + cy]; });
await p.mouse.click(...front);
rec('2_click_selects_base_front', { selected: await p.evaluate(() => window.__sabari.viewer.selected), highlight: await p.evaluate(() => window.__sabari.viewer.highlight.visible), tabBase: await p.getAttribute('#tab_base', 'aria-selected') });
// 같은 편집 코드 공유: 하단 면에서 이동·회전·반전·맞춤·실행 취소·단축키
await p.click('#rot180'); await p.click('#flipX'); await p.check('input[name=fit][value=cover]'); await p.fill('#xN', '10'); await p.dispatchEvent('#xN', 'change');
await p.keyboard.press('Escape'); await p.mouse.click(1000, 800); await p.keyboard.press('ArrowRight');
rec('2_base_edit', await p.evaluate(() => { const s = window.__sabari.faces.base_front.state; return { r: s.rotationDeg, fx: s.flipX, fit: s.fit, x: +s.offsetX.toFixed(2) }; }));
await p.waitForTimeout(900); await p.keyboard.press('Control+z'); rec('2_ctrlz_base', await p.evaluate(() => +window.__sabari.faces.base_front.state.offsetX.toFixed(2)));
// 이동 모드(3D 드래그)도 하단 면에서 작동
await p.locator('#moveMode').scrollIntoViewIfNeeded(); await p.check('#moveMode');
await p.evaluate(() => window.__sabari.viewer.setCameraRaw([0, 0.03, 0.3], [0, 0.03, 0])); await p.waitForTimeout(150);
const x0 = await p.evaluate(() => window.__sabari.faces.base_front.state.offsetX);
await p.mouse.move(840, 450); await p.mouse.down(); await p.mouse.move(900, 450, { steps: 6 }); await p.mouse.up();
rec('2_move_mode_drag_changes_base', (await p.evaluate(() => window.__sabari.faces.base_front.state.offsetX)) !== x0);
await p.uncheck('#moveMode');
// 단축키 [ ] 가 하단 면을 순회, Shift+7 = 아래
await p.mouse.click(1000, 800); const seq = []; for (let i = 0; i < 11; i++) { await p.keyboard.press(']'); seq.push(await p.evaluate(() => window.__sabari.viewer.selected)); }
rec('2_bracket_cycle', seq);
await p.keyboard.press('Shift+7'); rec('2_shift7_below', await p.evaluate(() => { const v = window.__sabari.viewer, t = v.controls.target; return v.camera.position.toArray().map((n, i) => +(n - t.toArray()[i]).toFixed(2)).join(','); }));
// 확대 유지 규칙: 아래 시점도 거리 유지
const dBefore = await p.evaluate(() => { const v = window.__sabari.viewer; return v.camera.position.distanceTo(v.controls.target); });
await p.keyboard.press('1'); await p.keyboard.press('Shift+7'); rec('2_below_keeps_zoom', Math.abs((await p.evaluate(() => { const v = window.__sabari.viewer; return v.camera.position.distanceTo(v.controls.target); })) - dBefore) < 1e-4);

// ===== 3. 하단 색 규칙: 이미지 없는 하단 면·여백은 "몸통" 색 =====
await p.click('#faceList button[data-face=base_bottom]'); await p.click('#btnRemove');
await p.evaluate(() => { const e = document.getElementById('colBase'); e.value = '#2c3e50'; e.dispatchEvent(new Event('input', { bubbles: true })); });
rec('3_empty_base_face_color', await p.evaluate(() => '#' + window.__sabari.viewer.faceMeshes.get('base_bottom').material.color.getHexString()));
rec('3_baked_margin_uses_body_color', await p.evaluate(() => { const c = window.__sabari.faces.base_front.canvas, d = c.getContext('2d').getImageData(2, 2, 1, 1).data; return [d[0], d[1], d[2]]; })); // 44,62,80 기대 (contain 아님: cover라 이미지가 덮을 수 있음)
await p.click('#btnColorReset'); await p.keyboard.press('Control+z'); // 바닥 이미지 복구
rec('3_undo_restores_bottom_image', await p.evaluate(() => !!window.__sabari.faces.base_bottom.img));

// ===== 4. PNG / GLB 저장 후 재로드 =====
await p.click('[data-view=iso]'); await p.click('#btnOpen');
for (const bg of ['white', 'transparent']) { await p.selectOption('#bgSel', bg); const [d] = await Promise.all([p.waitForEvent('download'), p.click('#btnPng')]); const f = path.join(V, `base10_${bg}.png`); await d.saveAs(f); rec(`4_png_${bg}_bytes`, fs.statSync(f).size); }
const [d10] = await Promise.all([p.waitForEvent('download'), p.click('#btnGlb')]); const glb10 = path.join(V, 'exported_base10.glb'); await d10.saveAs(glb10);
rec('4_glb10_bytes', fs.statSync(glb10).size);
const [pj10] = await Promise.all([p.waitForEvent('download'), p.click('#btnProjSave')]); const proj10 = path.join(V, 'base10.sabari'); await pj10.saveAs(proj10);
const expected = await p.evaluate(() => Object.fromEntries(Object.entries(window.__sabari.faces).map(([k, f]) => [k, f.state])));
{ // .sabari 안의 project.json: 버전 3 + 스위치 필드 + 하단 면 이미지 확인
  const { createRequire } = await import('node:module'); const JSZip = createRequire(import.meta.url)('../frontend/node_modules/jszip');
  const z = await JSZip.loadAsync(fs.readFileSync(proj10)); const j = JSON.parse(await z.file('project.json').async('string'));
  rec('4_project_json', { schemaVersion: j.schemaVersion, useBaseFaces: j.useBaseFaces, baseImagesInZip: Object.keys(z.files).filter((n) => n.startsWith('images/base_')).length, lidImagesInZip: Object.keys(z.files).filter((n) => n.startsWith('images/lid_')).length });
  const z5 = await JSZip.loadAsync(fs.readFileSync(proj5)); const j5 = JSON.parse(await z5.file('project.json').async('string'));
  rec('4_project_json_default_off', { schemaVersion: j5.schemaVersion, useBaseFaces: j5.useBaseFaces, baseImagesInZip: Object.keys(z5.files).filter((n) => n.startsWith('images/base_')).length });
}
rec('1_errors_p1', p.errors);
await ctx.close();

// ===== 5. .sabari 재열기(새 컨텍스트, 다른 PC 가정) → 스위치 켜짐 복원 =====
const ctx2 = await b.newContext({ viewport: { width: 1360, height: 900 } }); const p2 = await newPage(ctx2);
await p2.setInputFiles('#fileProj', proj10); await p2.waitForFunction(() => Object.values(window.__sabari.faces).every((f) => f.img));
rec('5_switch_restored_on', await p2.isChecked('#useBase'));
rec('5_tabs_visible', await p2.isVisible('#faceTabs'));
rec('5_state_equal', JSON.stringify(await p2.evaluate(() => Object.fromEntries(Object.entries(window.__sabari.faces).map(([k, f]) => [k, f.state])))) === JSON.stringify(expected));
rec('5_names', await p2.evaluate(() => Object.values(window.__sabari.faces).map((f) => f.name).filter(Boolean).length));
rec('5_lift', await p2.evaluate(() => window.__sabari.viewer.getLiftMm()));
await p2.screenshot({ path: path.join(V, '24_base10_reopened.png') });

// ===== 6. 임시저장 복원 =====
await p2.waitForFunction(() => document.getElementById('draftInfo').textContent.includes('자동 저장됨'), null, { timeout: 8000 }).catch(() => {});
await p2.reload(); await p2.waitForFunction(() => window.__sabari); await p2.waitForTimeout(500);
rec('6_after_reload_off_and_empty', { switchOff: !(await p2.isChecked('#useBase')), empty: (await imgs(p2, [...LID, ...BASE])).length === 0 });
await p2.click('#btnDraftLoad'); await p2.waitForFunction(() => Object.values(window.__sabari.faces).every((f) => f.img), null, { timeout: 8000 });
rec('6_draft_restored', { switchOn: await p2.isChecked('#useBase'), tabs: await p2.isVisible('#faceTabs'), images: (await imgs(p2, [...LID, ...BASE])).length });
rec('6_errors_p2', p2.errors);
await ctx2.close();

// ===== 7. GLB 재로드(GLB 뷰어): 10면 GLB + 기존 5면 GLB =====
const ctx3 = await b.newContext({ viewport: { width: 1360, height: 900 } }); const p3 = await newPage(ctx3);
await p3.click('#tabView');
for (const [name, f] of [['glb10', glb10], ['legacy5', path.join(FX, 'legacy_5face.glb')], ['default_off5', glb5]]) {
  await p3.setInputFiles('#fileGlb', f); await p3.waitForFunction(() => document.getElementById('glbInfo').textContent.includes('메시')); await p3.waitForTimeout(300);
  rec('7_viewer_' + name, await p3.textContent('#glbInfo'));
  if (name === 'glb10') await p3.screenshot({ path: path.join(V, '25_viewer_glb10.png') });
}
rec('7_errors_p3', p3.errors);
await ctx3.close();

// ===== 8. 끄기: 하단 이미지가 있을 때 확인 창 + 실행 취소 =====
const ctx4 = await b.newContext({ viewport: { width: 1360, height: 900 } }); const p4 = await newPage(ctx4);
await p4.setInputFiles('#fileProj', proj10); await p4.waitForFunction(() => Object.values(window.__sabari.faces).every((f) => f.img));
let dialogs = []; p4.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss(); });
await p4.uncheck('#useBase').catch(() => {}); await p4.waitForTimeout(200);
rec('8_cancel_keeps_everything', { dialogMsg: dialogs[0], switchStillOn: await p4.isChecked('#useBase'), baseImages: (await imgs(p4, BASE)).length });
p4.removeAllListeners('dialog'); p4.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });
await p4.uncheck('#useBase'); await p4.waitForTimeout(250);
rec('8_confirm_removes', { switchOff: !(await p4.isChecked('#useBase')), baseImages: (await imgs(p4, BASE)).length, lidImages: (await imgs(p4, LID)).length, tabsHidden: await p4.isHidden('#faceTabs'), listIsLidOnly: (await faceBtns(p4)).every((id) => id.startsWith('lid_')) });
await p4.mouse.click(1000, 800); await p4.keyboard.press('Control+z'); await p4.waitForTimeout(250);
rec('8_ctrl_z_restores', { switchOn: await p4.isChecked('#useBase'), baseImages: (await imgs(p4, BASE)).length, tabs: await p4.isVisible('#faceTabs') });
await p4.keyboard.press('Control+y'); await p4.waitForTimeout(250);
rec('8_ctrl_y_removes_again', { switchOff: !(await p4.isChecked('#useBase')), baseImages: (await imgs(p4, BASE)).length });
// 하단 이미지가 없으면 확인 창 없이 꺼진다
await p4.mouse.click(1000, 800); await p4.keyboard.press('Control+z'); await p4.waitForTimeout(200);
for (const id of BASE) { await p4.evaluate((id) => window.__sabari.setCurrent(id), id); await p4.click('#btnRemove'); }
const before = dialogs.length; await p4.uncheck('#useBase'); await p4.waitForTimeout(150);
rec('8_no_dialog_when_empty', { newDialogs: dialogs.length - before, switchOff: !(await p4.isChecked('#useBase')) });
rec('8_errors_p4', p4.errors);
await ctx4.close();

// ===== 9. 기존 5면 .sabari(v2) 호환 + 미래 버전 오류 =====
const ctx5 = await b.newContext({ viewport: { width: 1360, height: 900 } }); const p5 = await newPage(ctx5);
await p5.setInputFiles('#fileProj', path.join(FX, 'legacy_v2_5face.sabari')); await p5.waitForFunction(() => ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right'].every((id) => window.__sabari.faces[id].img)); await p5.waitForTimeout(200);
rec('9_legacy_v2_opens_switch_off', { switchOff: !(await p5.isChecked('#useBase')), lid: (await imgs(p5, LID)).length, base: (await imgs(p5, BASE)).length, msg: await p5.textContent('#msgText') });
await p5.setInputFiles('#fileProj', path.join(FX, 'future_v99.sabari')); await p5.waitForFunction(() => document.getElementById('msgText').textContent.includes('열 수 없습니다'), null, { timeout: 5000 }).catch(() => {});
rec('9_future_version_message', await p5.textContent('#msgText'));
rec('9_future_version_did_not_change_state', { lid: (await imgs(p5, LID)).length });
// 새 형식(v3)이지만 스위치 꺼짐인 방금의 .sabari도 열린다
await p5.setInputFiles('#fileProj', proj5); await p5.waitForFunction(() => document.getElementById('msgText').textContent.includes('열었습니다')); await p5.waitForTimeout(300);
rec('9_default_off_project_reopen', { switchOff: !(await p5.isChecked('#useBase')), lid: (await imgs(p5, LID)).length });
rec('9_errors_p5', p5.errors);
await ctx5.close();

fs.writeFileSync(path.join(V, 'base10_results.json'), JSON.stringify(R, null, 2));
console.log(JSON.stringify(R)); await b.close();

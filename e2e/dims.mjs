// 박스 치수 검증: SABARI_URL=http://127.0.0.1:8766/ node e2e/dims.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), V = path.join(ROOT, 'verification'), S = path.join(ROOT, 'assets', 'samples'), FX = path.join(ROOT, 'e2e', 'fixtures');
const JSZip = createRequire(import.meta.url)('../frontend/node_modules/jszip');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
const R = {}; const rec = (k, v) => { R[k] = v; };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const LID = ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right'], BASE = ['base_front', 'base_back', 'base_left', 'base_right', 'base_bottom'];
const newPage = async (ctx) => { const p = await ctx.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(String(e))); await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(250); return p; };
const params = (p) => p.evaluate(() => window.__sabari.getParams());
const putImage = async (p, id, file) => { await p.evaluate((id) => window.__sabari.setCurrent(id), id); await p.setInputFiles('#filePick', file); await p.waitForFunction((id) => window.__sabari.faces[id].img, id); };
const openDims = async (p) => { if (!(await p.evaluate(() => document.getElementById('dDims').open))) await p.click('#dDims > summary'); };
const setNum = async (p, mode, key, value) => { const sel = `#dim_${mode}_${key}`; await p.locator(sel).scrollIntoViewIfNeeded(); await p.fill(sel, String(value)); };

/** GLB 바이트에서 부품 그룹별 바운딩박스(mm)를 읽는다. 노드 이동(translation)도 반영한다. */
function glbExtents(buf) {
  const jl = buf.readUInt32LE(12); const j = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
  const boxes = { lid: [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]], base: [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]], all: [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]] };
  const walk = (ni, off) => {
    const n = j.nodes[ni]; const t = n.translation ?? [0, 0, 0]; const o = [off[0] + t[0], off[1] + t[1], off[2] + t[2]];
    if (n.mesh !== undefined) {
      const name = n.name ?? j.meshes[n.mesh].name ?? ''; const acc = j.accessors[j.meshes[n.mesh].primitives[0].attributes.POSITION];
      for (const g of [name.startsWith('base_') ? 'base' : 'lid', 'all']) for (let k = 0; k < 3; k++) { boxes[g][0][k] = Math.min(boxes[g][0][k], acc.min[k] + o[k]); boxes[g][1][k] = Math.max(boxes[g][1][k], acc.max[k] + o[k]); }
    }
    for (const c of n.children ?? []) walk(c, o);
  };
  for (const n of j.scenes[j.scene ?? 0].nodes) walk(n, [0, 0, 0]);
  const ext = (g) => boxes[g][1].map((v, k) => +((v - boxes[g][0][k]) * 1000).toFixed(3));
  const rootExtras = j.nodes.find((n) => n.name === 'Template')?.extras;
  return { lid: ext('lid'), base: ext('base'), all: ext('all'), extrasParams: rootExtras?.params ?? null };
}
const exportGlb = async (p, file) => { const [d] = await Promise.all([p.waitForEvent('download'), p.click('#btnGlb')]); await d.saveAs(file); return fs.readFileSync(file); };

const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const p = await newPage(ctx);
await openDims(p);
rec('0_default_params', await params(p));
rec('0_default_fields', await p.evaluate(() => ['baseW', 'baseD', 'baseH', 'lidH', 'board', 'lidClearance'].map((k) => document.getElementById('dim_outer_' + k).value)));
rec('0_derived_text', await p.textContent('#dimsDerived'));
rec('0_assume_note_shown', (await p.textContent('#dDims')).includes('제조 규격'));

// 이미지·하단 스위치·색·뚜껑 높이를 먼저 설정해 두고 치수를 바꿔도 유지되는지 확인
await p.check('#useBase');
for (const f of [...LID, ...BASE]) await putImage(p, f, path.join(S, `sample_${f}.png`));
await p.evaluate(() => window.__sabari.setCurrent('base_front'));
await p.fill('#xN', '10'); await p.dispatchEvent('#xN', 'change'); await p.click('#rot180'); await p.check('input[name=fit][value=cover]');
await p.click('#btnOpen'); // 뚜껑 80mm
await p.evaluate(() => { const e = document.getElementById('colBase'); e.value = '#2c3e50'; e.dispatchEvent(new Event('input', { bubbles: true })); });
const before = await p.evaluate(() => ({ st: { ...window.__sabari.faces.base_front.state }, lift: window.__sabari.viewer.getLiftMm(), img: Object.values(window.__sabari.faces).filter((f) => f.img).length, base: document.getElementById('useBase').checked, col: document.getElementById('colBase').value, canvas: [window.__sabari.faces.base_front.canvas.width, window.__sabari.faces.base_front.canvas.height] }));
rec('1_before', before);

// ===== 2. 높이 43→60: 3D 실제 크기가 입력값과 일치 =====
await openDims(p);
await p.locator('#dim_outer_baseH').scrollIntoViewIfNeeded(); await p.click('#dim_outer_baseH'); await p.fill('#dim_outer_baseH', ''); await p.type('#dim_outer_baseH', '60', { delay: 120 });
await p.waitForTimeout(400);
rec('2_params_after', await params(p));
rec('2_face_size_text_base_front', await (async () => { await p.evaluate(() => window.__sabari.setCurrent('base_front')); return p.textContent('#faceSize'); })());
await p.click('#btnClose'); // 닫은 상태로 내보내 전체 바운딩박스를 잰다
const glb60 = path.join(V, 'dims_h60.glb'); const e60 = glbExtents(await exportGlb(p, glb60));
rec('2_glb_extents_mm', e60); // base = [160,60,110], lid = [165,38,115], all = [165, 62, 115]
rec('2_glb_extras_params', e60.extrasParams);
await p.click('#btnOpen');
const after = await p.evaluate(() => ({ st: { ...window.__sabari.faces.base_front.state }, lift: window.__sabari.viewer.getLiftMm(), img: Object.values(window.__sabari.faces).filter((f) => f.img).length, base: document.getElementById('useBase').checked, col: document.getElementById('colBase').value, canvas: [window.__sabari.faces.base_front.canvas.width, window.__sabari.faces.base_front.canvas.height], fit: window.__sabari.faces.base_front.state.fit }));
rec('2_after', after);
rec('2_kept', { images: after.img === before.img, state: JSON.stringify(after.st) === JSON.stringify(before.st), lift: after.lift === 80, base: after.base, color: after.col === before.col });
rec('2_canvas_aspect_matches_face', { w: after.canvas[0] / after.canvas[1], expected: 160 / 60 });
await p.click('[data-view=iso]'); await p.waitForTimeout(250);
await p.screenshot({ path: path.join(V, '30_dims_h60.png') });
// 같은 GLB 를 GLB 뷰어 모드에서 열어 치수 정보가 보이는지
const p2 = await newPage(await b.newContext({ viewport: { width: 1360, height: 900 } }));
await p2.setInputFiles('#fileGlb', glb60); await p2.waitForFunction(() => document.getElementById('glbInfo').textContent.includes('메시'));
rec('2_viewer_opens_h60_glb', await p2.textContent('#glbInfo'));
rec('2_viewer_errors', p2.errors); await p2.context().close();

// ===== 실행 취소/다시 실행 (치수 변경도 한 항목, 연속 입력은 하나로) =====
await p.mouse.click(1000, 800);
await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
rec('3_undo_params_baseH', (await params(p)).baseH);
rec('3_undo_keeps_images', (await p.evaluate(() => Object.values(window.__sabari.faces).filter((f) => f.img).length)));
await p.keyboard.press('Control+y'); await p.waitForTimeout(300);
rec('3_redo_params_baseH', (await params(p)).baseH);

// ===== 5. 불가능한 조합 거부 =====
const bad = {};
for (const [key, val] of [['baseW', -5], ['baseH', 0], ['board', 30], ['lidClearance', -1]]) {
  const prev = await params(p);
  await setNum(p, 'outer', key, val); await p.waitForTimeout(150);
  bad[`${key}=${val}`] = { error: await p.textContent('#dimsError'), visible: await p.isVisible('#dimsError'), applied: JSON.stringify(await params(p)) !== JSON.stringify(prev) };
  await setNum(p, 'outer', key, prev[key]); await p.waitForTimeout(150);
}
rec('5_invalid_rejected', bad);
rec('5_error_hidden_after_fix', await p.isHidden('#dimsError'));
rec('5_empty_field', await (async () => { await p.fill('#dim_outer_baseD', ''); await p.waitForTimeout(100); const r = { text: await p.textContent('#dimsError'), p: (await params(p)).baseD }; await p.fill('#dim_outer_baseD', '110'); return r; })());

// ===== 5. 입력 기준 전환 (완성 외경 ↔ 싸바리지) =====
await p.click('#btnDimsDefault'); await p.waitForTimeout(300);
await p.check('input[name=dimMode][value=wrap]');
rec('5_wrap_fields_default', await p.evaluate(() => ['lidWrapW', 'lidWrapD', 'lidWingDepth', 'baseWingDepth', 'board', 'lidClearance'].map((k) => document.getElementById('dim_wrap_' + k).value)));
await setNum(p, 'wrap', 'lidWrapW', 187.4); await p.waitForTimeout(250);
const pw = await params(p);
rec('5_wrap_edit_to_outer', { baseW: pw.baseW, baseD: pw.baseD, expectBaseW: 180 });
await p.check('input[name=dimMode][value=outer]');
rec('5_back_to_outer_field', await p.inputValue('#dim_outer_baseW'));
await p.check('input[name=dimMode][value=wrap]'); await setNum(p, 'wrap', 'baseWingDepth', 60); await p.waitForTimeout(250);
rec('5_wrap_base_wing_depth_to_baseH', (await params(p)).baseH);
await p.check('input[name=dimMode][value=outer]');
// 싸바리지가 너무 작아 몸통이 음수가 되는 입력
await p.check('input[name=dimMode][value=wrap]'); await setNum(p, 'wrap', 'lidWrapW', 20); await p.waitForTimeout(200);
rec('5_wrap_too_small', { error: await p.textContent('#dimsError'), p: (await params(p)).baseW });
await p.check('input[name=dimMode][value=outer]');

// ===== 기본값 복원 / 원래 사이즈로 되돌리기 =====
await p.click('#btnDimsDefault'); await p.waitForTimeout(300);
rec('6_default_restored', (await params(p)).baseH);
await setNum(p, 'outer', 'baseH', 70); await p.waitForTimeout(300);
await p.click('#btnDimsBaseline'); await p.waitForTimeout(300);
rec('6_baseline_restored_baseH', (await params(p)).baseH); // 처음 열었을 때 = 43
await p.keyboard.press('Escape'); await p.mouse.click(1000, 800); await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
rec('6_ctrl_z_after_baseline', (await params(p)).baseH); // 70

// ===== .sabari / 임시저장에 치수 저장 → 새 컨텍스트에서 복원 =====
await setNum(p, 'outer', 'baseH', 60); await setNum(p, 'outer', 'baseW', 170); await p.waitForTimeout(400);
const [pj] = await Promise.all([p.waitForEvent('download'), p.click('#btnProjSave')]); const projPath = path.join(V, 'dims_h60.sabari'); await pj.saveAs(projPath);
const zj = JSON.parse(await (await JSZip.loadAsync(fs.readFileSync(projPath))).file('project.json').async('string'));
rec('7_project_json', { schemaVersion: zj.schemaVersion, params: zj.params });
rec('7_baseline_after_save', (await p.evaluate(() => window.__sabari.getBaseline())).baseH);
rec('7_errors_p', p.errors);
await p.waitForFunction(() => document.getElementById('draftInfo').textContent.includes('자동 저장됨'), null, { timeout: 8000 }).catch(() => {});
// 임시저장 복원(같은 프로필 새 페이지)
const pd = await newPage(ctx); await pd.waitForTimeout(400);
await pd.click('#btnDraftLoad'); await pd.waitForFunction(() => Object.values(window.__sabari.faces).every((f) => f.img), null, { timeout: 15000 }); await pd.waitForTimeout(400);
rec('7_draft_switch_on', await pd.isChecked('#useBase'));
rec('7_draft_restored_params', await params(pd));
rec('7_draft_face_size_text', await (async () => { await pd.evaluate(() => window.__sabari.setCurrent('base_front')); return pd.textContent('#faceSize'); })());
rec('7_draft_errors', pd.errors); await pd.close();
await ctx.close();

const ctx2 = await b.newContext({ viewport: { width: 1360, height: 900 } }); const p3 = await newPage(ctx2);
await p3.setInputFiles('#fileProj', projPath); await p3.waitForFunction(() => Object.values(window.__sabari.faces).every((f) => f.img), null, { timeout: 10000 }); await p3.waitForTimeout(400);
rec('7_reopen_params', await params(p3));
rec('7_reopen_baseline_is_opened', (await p3.evaluate(() => window.__sabari.getBaseline())).baseH);
rec('7_reopen_field', await (async () => { await openDims(p3); return p3.inputValue('#dim_outer_baseH'); })());
rec('7_reopen_switch_on', await p3.isChecked('#useBase'));
rec('7_reopen_no_ratio_alert', await p3.evaluate(() => !document.getElementById('ratioBanner') || document.getElementById('ratioBanner').hidden));
rec('7_reopen_errors', p3.errors); await ctx2.close();

// ===== 이전 버전 파일: 치수 없는 .sabari(v2·v3) =====
const ctx3 = await b.newContext({ viewport: { width: 1360, height: 900 } }); const p4 = await newPage(ctx3);
for (const [name, f, wait] of [['v2', 'legacy_v2_5face.sabari', 5], ['v3', 'legacy_v3_10face.sabari', 10]]) {
  await p4.setInputFiles('#fileProj', path.join(FX, f)); await p4.waitForFunction((n) => Object.values(window.__sabari.faces).filter((x) => x.img).length >= n, wait, { timeout: 10000 }); await p4.waitForTimeout(300);
  rec(`8_legacy_${name}`, { params: await params(p4), images: await p4.evaluate(() => Object.values(window.__sabari.faces).filter((x) => x.img).length) }); // 기본값
}
rec('8_legacy_errors', p4.errors); await ctx3.close();
fs.writeFileSync(path.join(V, 'dims_results.json'), JSON.stringify(R, null, 2));
console.log(JSON.stringify(R)); await b.close();

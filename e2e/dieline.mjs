// 칼선 SVG 내려받기 + 칼선 이미지 분할 검증: SABARI_URL=http://127.0.0.1:8766/ node e2e/dieline.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), V = path.join(ROOT, 'verification');
const JSZip = createRequire(import.meta.url)('../frontend/node_modules/jszip');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
const R = {}; const rec = (k, v) => { R[k] = v; };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(250);

// 면별 고유 색 (면 이미지에서 "왼쪽 위 모서리" 표식 = 흰색 사각형)
const COLORS = { lid_top: [214, 40, 40], lid_front: [30, 100, 220], lid_back: [30, 160, 70], lid_left: [0, 160, 170], lid_right: [130, 50, 190], base_front: [240, 120, 20], base_back: [60, 40, 255], base_left: [220, 40, 170], base_right: [230, 40, 100], base_bottom: [140, 200, 20] };

/** 앱의 레이아웃(window.__sabari.getLayout)대로 테스트 칼선 이미지를 그린다. 면 안은 고유 색 + 면 이미지 기준 왼쪽 위 흰 표식, 그 밖(접어 넣는 영역·여분)은 회색/연한 색. */
const makeDieline = (kind, bleed, scale, colors) => p.evaluate(async ({ kind, bleed, scale, colors }) => {
  const d = window.__sabari.getLayout(kind);
  const W = Math.round((d.width + 2 * bleed) * scale), H = Math.round((d.height + 2 * bleed) * scale);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, W, H); // 여분·바깥
  g.fillStyle = '#cfcfcf'; for (const t of d.tuckRects) g.fillRect((t.x + bleed) * scale, (t.y + bleed) * scale, t.w * scale, t.h * scale); // 접어 넣는 영역
  for (const f of d.faces) {
    const [r, gg, bb] = colors[f.id];
    const cx = (f.rect.x + bleed + f.rect.w / 2) * scale, cy = (f.rect.y + bleed + f.rect.h / 2) * scale;
    g.save(); g.translate(cx, cy); g.rotate((f.rotationDeg * Math.PI) / 180);
    const fw = f.faceW * scale, fh = f.faceH * scale; // 면 이미지(회전 전) 크기
    g.fillStyle = `rgb(${r},${gg},${bb})`; g.fillRect(-fw / 2, -fh / 2, fw, fh);
    g.fillStyle = '#fff'; g.fillRect(-fw / 2, -fh / 2, 8 * scale, 8 * scale); // 면 이미지 기준 왼쪽 위 표식(8mm)
    g.restore();
  }
  const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
  return { b64: btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer()))), W, H, layout: { width: d.width, height: d.height, faces: d.faces.map((f) => ({ id: f.id, side: f.side, rot: f.rotationDeg, rect: f.rect })) } };
}, { kind, bleed, scale, colors });

/** 면 이미지(blob)의 지정 위치 색 */
const faceColors = () => p.evaluate(async () => {
  const out = {};
  for (const [id, f] of Object.entries(window.__sabari.faces)) {
    if (!f.blob) { out[id] = null; continue; }
    const bmp = await createImageBitmap(f.blob); const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
    const px = (x, y) => Array.from(g.getImageData(Math.min(bmp.width - 1, Math.max(0, Math.round(x))), Math.min(bmp.height - 1, Math.max(0, Math.round(y))), 1, 1).data.slice(0, 3));
    out[id] = { w: bmp.width, h: bmp.height, center: px(bmp.width / 2, bmp.height / 2), topLeft: px(bmp.width * 0.02, bmp.height * 0.05), bottomRight: px(bmp.width * 0.98, bmp.height * 0.95), left: px(2, bmp.height / 2), top: px(bmp.width / 2, 2), bottom: px(bmp.width / 2, bmp.height - 3), right: px(bmp.width - 3, bmp.height / 2), name: f.name };
  }
  return out;
});
const near = (a, b2, tol = 14) => a && a.every((v, i) => Math.abs(v - b2[i]) <= tol);
const WHITE = [255, 255, 255];

if (!(await p.evaluate(() => document.getElementById('dDie').open))) await p.click('#dDie > summary');

// ===== 칼선 SVG 내려받기 (뚜껑·하단, 치수 변경 반영) =====
rec('0_disclaimer_in_panel', (await p.textContent('#dDie')).includes('제조 칼선 아님'));
const svgInfo = async (btn, label) => {
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click(btn)]); const f = path.join(V, label); await dl.saveAs(f);
  const t = fs.readFileSync(f, 'utf8');
  const w = +/width="([\d.]+)mm"/.exec(t)[1], h = +/height="([\d.]+)mm"/.exec(t)[1], vb = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(t).slice(1).map(Number), cw = +/data-cut-width-mm="([\d.]+)"/.exec(t)[1], ch = +/data-cut-height-mm="([\d.]+)"/.exec(t)[1], bl = +/data-bleed-mm="([\d.]+)"/.exec(t)[1];
  return { file: label, widthMm: w, heightMm: h, viewBox: vb, cutWidthMm: cw, cutHeightMm: ch, bleedMm: bl, oneToOne: Math.abs(vb[2] - w) < 1e-6 && Math.abs(vb[3] - h) < 1e-6, layers: ['재단선', '접는선', '안내선'].every((id) => t.includes(`id="${id}"`)), disclaimer: t.includes('제조 칼선 아님') && t.includes('인쇄소 템플릿'), hasScript: /<script/i.test(t), dashedFold: /stroke="#0066ff"[^>]*stroke-dasharray/.test(t), solidCut: !/stroke-dasharray/.test(t.slice(t.indexOf('id="재단선"'), t.indexOf('id="접는선"'))) };
};
rec('1_svg_lid_default', await svgInfo('#btnDieLid', 'app_dieline_lid_default.svg'));
await p.click('#dDims > summary'); await p.fill('#dim_outer_lidH', '50'); await p.fill('#dim_outer_baseW', '200'); await p.waitForTimeout(400);
const lay50 = await p.evaluate(() => window.__sabari.getLayout('lid'));
const svg50 = await svgInfo('#btnDieLid', 'app_dieline_lid_h50.svg');
rec('1_svg_lid_changed', { ...svg50, expectCutW: lay50.width, expectCutH: lay50.height, matches: Math.abs(svg50.cutWidthMm - lay50.width) < 0.01 && Math.abs(svg50.cutHeightMm - lay50.height) < 0.01 });
rec('1_svg_base', await svgInfo('#btnDieBase', 'app_dieline_base.svg'));
await p.click('#btnDimsDefault'); await p.waitForTimeout(300);

// ===== 8-1. 뚜껑 칼선 분할: 각 색이 올바른 면에 들어가는가 =====
const lidCols = Object.fromEntries(Object.entries(COLORS).filter(([k]) => k.startsWith('lid_')));
const sheet = await makeDieline('lid', 3, 8, lidCols);
fs.writeFileSync(path.join(V, 'test_dieline_lid.png'), Buffer.from(sheet.b64, 'base64'));
rec('2_test_sheet', { px: [sheet.W, sheet.H], layout: sheet.layout.faces.map((f) => `${f.id}:${f.side}:${f.rot}`) });
await p.setInputFiles('#fileDieline', { name: '칼선_테스트 시안.png', mimeType: 'image/png', buffer: Buffer.from(sheet.b64, 'base64') });
await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(400);
rec('2_dialog_rows', await p.evaluate(() => [...document.querySelectorAll('#splitList .split-row b')].map((e) => e.textContent)));
rec('2_dialog_no_mismatch_warning', await p.isHidden('#splitWarn'));
rec('2_dialog_default_bleed', await p.inputValue('#splitBleed'));
await p.screenshot({ path: path.join(V, '33_split_dialog.png') });
await p.click('#btnSplitApply'); await p.waitForFunction(() => !document.getElementById('splitDlg').open); await p.waitForTimeout(500);
const c1 = await faceColors();
const verdict1 = {};
for (const [id, col] of Object.entries(lidCols)) {
  const c = c1[id]; if (!c) { verdict1[id] = '이미지 없음'; continue; }
  const aspect = c.w / c.h, face = (await p.evaluate((id) => { const f = window.__sabari.faces[id].canvas; return f.width / f.height; }, id));
  verdict1[id] = { colorOk: near(c.center, col), bottomRightOk: near(c.bottomRight, col), markerTopLeftOk: near(c.topLeft, WHITE), notTuckGray: !near(c.left, [207, 207, 207]) && !near(c.top, [207, 207, 207]), size: [c.w, c.h], aspectVsFace: +(aspect / face).toFixed(3) };
}
rec('2_split_lid_verdict', verdict1);
rec('2_split_lid_all_ok', Object.values(verdict1).every((v) => v.colorOk && v.bottomRightOk && v.markerTopLeftOk && v.notTuckGray && Math.abs(v.aspectVsFace - 1) < 0.01));
rec('2_base_faces_untouched', Object.entries(c1).filter(([k]) => k.startsWith('base_')).every(([, v]) => v === null));
rec('2_dieline_info', await p.textContent('#dielineInfo'));
rec('2_edit_button_enabled', !(await p.isDisabled('#btnSplitEdit')));
rec('2_ratio_no_alert_after_split', await p.evaluate(() => document.getElementById('ratioBanner').hidden));
await p.screenshot({ path: path.join(V, '34_split_applied.png') });

// 분할 결과가 기존 면 편집·실행 취소와 호환되는가
await p.evaluate(() => window.__sabari.setCurrent('lid_top'));
await p.click('#rot180'); await p.fill('#xN', '10'); await p.dispatchEvent('#xN', 'change');
rec('3_edit_after_split', await p.evaluate(() => { const s = window.__sabari.faces.lid_top.state; return { rot: s.rotationDeg, x: +s.offsetX.toFixed(2), fit: s.fit }; }));
await p.waitForTimeout(900); await p.mouse.click(1000, 840); await p.keyboard.press('Control+z'); await p.keyboard.press('Control+z');
rec('3_undo_edits', await p.evaluate(() => { const s = window.__sabari.faces.lid_top.state; return { rot: s.rotationDeg, x: s.offsetX }; }));
await p.keyboard.press('Control+z'); await p.waitForTimeout(500);
rec('3_undo_split_restores_empty', await p.evaluate(() => Object.entries(window.__sabari.faces).filter(([k, f]) => k.startsWith('lid_') && f.img).length));
await p.keyboard.press('Control+y'); await p.waitForTimeout(600);
rec('3_redo_split', await p.evaluate(() => Object.entries(window.__sabari.faces).filter(([k, f]) => k.startsWith('lid_') && f.img).length));

// ===== 8-2. 영역 조정 후 결과가 바뀌는가 (lid_top 사각형을 오른쪽으로 끌기, lid_front 모서리로 줄이기) =====
const before = (await faceColors())['lid_top'];
await p.click('#btnSplitEdit'); await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(400);
rec('4_dialog_restores_saved_regions', await p.evaluate(() => !!document.querySelector('#splitSvg rect[data-role=move]')));
const box = await p.evaluate(() => { const g = document.querySelector('#splitSvg g[data-face=lid_top] rect[data-role=move]'); const r = g.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; });
const imgBox = await p.evaluate(() => { const r = document.getElementById('splitImg').getBoundingClientRect(); return { w: r.width, nat: document.getElementById('splitImg').naturalWidth }; });
const pxPerCss = imgBox.nat / imgBox.w;
await p.mouse.move(box.x, box.y); await p.mouse.down(); await p.mouse.move(box.x + 40, box.y, { steps: 8 }); await p.mouse.up(); // 오른쪽 약 40 CSS px 이동
const moved = await p.evaluate(() => JSON.stringify(document.querySelector('#splitSvg g[data-face=lid_top] rect[data-role=move]').getBoundingClientRect().x));
rec('4_dragged_css_px', { movedByCss: +(JSON.parse(moved) - (box.x - box.w / 2)).toFixed(1), imagePxPerCss: +pxPerCss.toFixed(2) });
// 크기 조정: lid_front 의 동남쪽 점을 안쪽으로
const handle = await p.evaluate(() => { const r = document.querySelector('#splitSvg g[data-face=lid_front] rect[data-role=se]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
const sizeBefore = await p.evaluate(() => document.querySelector('#splitList .split-row:nth-child(3) small').textContent);
await p.mouse.move(handle.x, handle.y); await p.mouse.down(); await p.mouse.move(handle.x - 20, handle.y - 30, { steps: 6 }); await p.mouse.up();
rec('4_resize', { before: sizeBefore, after: await p.evaluate(() => [...document.querySelectorAll('#splitList .split-row small')].map((e) => e.textContent)) });
await p.screenshot({ path: path.join(V, '35_split_adjusted.png') });
await p.click('#btnSplitApply'); await p.waitForFunction(() => !document.getElementById('splitDlg').open); await p.waitForTimeout(500);
const after = (await faceColors())['lid_top'];
// lid_top 은 칼선에서 270° 돌려 놓였으므로, 칼선에서 오른쪽으로 옮기면 면 이미지에서는 아래쪽 가장자리 쪽 내용이 바뀐다
rec('4_result_changed', { before: { bottom: before.bottom, left: before.left }, after: { bottom: after.bottom, left: after.left }, bottomEdgeChanged: near(before.bottom, COLORS.lid_top) && !near(after.bottom, COLORS.lid_top), centerStill: near(after.center, COLORS.lid_top), otherEdgesSame: near(after.left, COLORS.lid_top) && near(after.top, COLORS.lid_top) });
// 회전 변경: 사용자가 lid_back 의 회전을 바꾸면 표식 위치가 달라진다
const backBefore = (await faceColors())['lid_back'];
await p.click('#btnSplitEdit'); await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(300);
await p.evaluate(() => { const rows = [...document.querySelectorAll('#splitList .split-row')]; const row = rows.find((r) => r.querySelector('b').textContent === '뒷날개'); const sel = row.querySelector('select'); sel.value = '270'; sel.dispatchEvent(new Event('change')); });
await p.click('#btnSplitApply'); await p.waitForFunction(() => !document.getElementById('splitDlg').open); await p.waitForTimeout(500);
const backAfter = (await faceColors())['lid_back'];
rec('4_rotation_change', { before: { w: backBefore.w, h: backBefore.h, tl: backBefore.topLeft }, after: { w: backAfter.w, h: backAfter.h, tl: backAfter.topLeft }, markerMoved: near(backBefore.topLeft, WHITE) && !near(backAfter.topLeft, WHITE) });
// 자동 배치로 되돌리기 후 적용: 원래 결과
await p.click('#btnSplitEdit'); await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(300); await p.click('#btnSplitAuto'); await p.click('#btnSplitApply'); await p.waitForFunction(() => !document.getElementById('splitDlg').open); await p.waitForTimeout(500);
rec('4_auto_reset_restores', near((await faceColors())['lid_top'].left, COLORS.lid_top));

// ===== 저장 → 새 컨텍스트 재열기: 분할 영역·원본 칼선 이미지 복원 =====
await p.click('#btnSplitEdit'); await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(300);
const m2 = await p.evaluate(() => { const g = document.querySelector('#splitSvg g[data-face=lid_top] rect[data-role=move]'); const r = g.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await p.mouse.move(m2.x, m2.y); await p.mouse.down(); await p.mouse.move(m2.x + 30, m2.y + 10, { steps: 6 }); await p.mouse.up();
await p.click('#btnSplitApply'); await p.waitForFunction(() => !document.getElementById('splitDlg').open); await p.waitForTimeout(500);
const savedRegion = await p.evaluate(() => JSON.parse(JSON.stringify(window.__sabari.getDieline().regions.lid_top)));
const [pj] = await Promise.all([p.waitForEvent('download'), p.click('#btnProjSave')]); const proj = path.join(V, 'dieline_split.sabari'); await pj.saveAs(proj);
const zip = await JSZip.loadAsync(fs.readFileSync(proj)); const pjson = JSON.parse(await zip.file('project.json').async('string'));
const dlFile = Object.keys(zip.files).find((n) => n.startsWith('images/dieline'));
const origBytes = Buffer.from(sheet.b64, 'base64'); const zipBytes = Buffer.from(await zip.file(dlFile).async('uint8array'));
rec('5_project_json_dieline', { schemaVersion: pjson.schemaVersion, file: pjson.dieline.file, bleedMm: pjson.dieline.bleedMm, kind: pjson.dieline.kind, regionCount: Object.keys(pjson.dieline.regions).length, lid_top_saved: pjson.dieline.regions.lid_top, rotations: pjson.dieline.rotations, originalName: pjson.dieline.originalName });
rec('5_original_bytes_identical', { sameLength: origBytes.length === zipBytes.length, identical: Buffer.compare(origBytes, zipBytes) === 0, bytes: zipBytes.length });
rec('5_region_matches_ui', JSON.stringify(savedRegion) === JSON.stringify(pjson.dieline.regions.lid_top));
rec('5_errors_p', errs);
await ctx.close();

const ctx2 = await b.newContext({ viewport: { width: 1360, height: 900 } }); const p2 = await ctx2.newPage(); const errs2 = []; p2.on('pageerror', (e) => errs2.push(String(e)));
await p2.goto(URL); await p2.waitForFunction(() => window.__sabari);
await p2.setInputFiles('#fileProj', proj); await p2.waitForFunction(() => ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right'].every((id) => window.__sabari.faces[id].img), null, { timeout: 15000 }); await p2.waitForTimeout(600);
rec('6_reopen', await p2.evaluate(() => { const d = window.__sabari.getDieline(); return { has: !!d, name: d?.name, bleed: d?.bleedMm, kind: d?.kind, lidTop: d?.regions.lid_top, size: d?.blob.size, editEnabled: !document.getElementById('btnSplitEdit').disabled, info: document.getElementById('dielineInfo').textContent }; }));
rec('6_reopen_region_equal', JSON.stringify(await p2.evaluate(() => window.__sabari.getDieline().regions.lid_top)) === JSON.stringify(pjson.dieline.regions.lid_top));
await p2.click('#dDie > summary'); await p2.click('#btnSplitEdit'); await p2.waitForSelector('#splitDlg[open]'); await p2.waitForTimeout(300);
rec('6_reopen_dialog_rect_matches_saved', await p2.evaluate((saved) => { const el = document.querySelector('#splitSvg g[data-face=lid_top] rect[data-role=move]'); return { x: +el.getAttribute('x'), y: +el.getAttribute('y'), saved: [+saved.x.toFixed(2), +saved.y.toFixed(2)] }; }, pjson.dieline.regions.lid_top));
await p2.click('#btnSplitCancel');
rec('6_reopen_errors', errs2);
await ctx2.close();

// ===== 8-3. 하단 칼선 분할 + 이미지 비율이 어긋난 경우 경고 =====
const ctx3 = await b.newContext({ viewport: { width: 1360, height: 900 } }); const p3 = await ctx3.newPage(); const errs3 = []; p3.on('pageerror', (e) => errs3.push(String(e)));
await p3.goto(URL); await p3.waitForFunction(() => window.__sabari);
const mk3 = (kind, bleed, scale, colors) => p3.evaluate(async ({ kind, bleed, scale, colors }) => {
  const d = window.__sabari.getLayout(kind); const W = Math.round((d.width + 2 * bleed) * scale), H = Math.round((d.height + 2 * bleed) * scale);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'); g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, W, H);
  for (const f of d.faces) { const [r, gg, bb] = colors[f.id]; g.fillStyle = `rgb(${r},${gg},${bb})`; g.fillRect((f.rect.x + bleed) * scale, (f.rect.y + bleed) * scale, f.rect.w * scale, f.rect.h * scale); }
  const blob = await new Promise((res) => cv.toBlob(res, 'image/png')); return btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())));
}, { kind, bleed, scale, colors });
const baseCols = Object.fromEntries(Object.entries(COLORS).filter(([k]) => k.startsWith('base_')));
await p3.click('#dDie > summary');
await p3.setInputFiles('#fileDieline', { name: 'base.png', mimeType: 'image/png', buffer: Buffer.from(await mk3('base', 3, 6, baseCols), 'base64') });
await p3.waitForSelector('#splitDlg[open]'); await p3.selectOption('#splitKind', 'base'); await p3.waitForTimeout(300);
rec('7_base_rows', await p3.evaluate(() => [...document.querySelectorAll('#splitList .split-row b')].map((e) => e.textContent)));
await p3.click('#btnSplitApply'); await p3.waitForFunction(() => !document.getElementById('splitDlg').open); await p3.waitForTimeout(600);
const bc = await p3.evaluate(async () => { const o = {}; for (const [id, f] of Object.entries(window.__sabari.faces)) { if (!f.blob || !id.startsWith('base_')) continue; const bmp = await createImageBitmap(f.blob); const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d'); g.drawImage(bmp, 0, 0); o[id] = Array.from(g.getImageData(bmp.width >> 1, bmp.height >> 1, 1, 1).data.slice(0, 3)); } return o; });
rec('7_base_split', { switchTurnedOn: await p3.isChecked('#useBase'), colorsOk: Object.fromEntries(Object.entries(baseCols).map(([id, col]) => [id, near(bc[id], col)])) });
// 비율이 어긋난 이미지(여분 값이 다름): 경고 표시
await p3.setInputFiles('#fileDieline', { name: 'wrong.png', mimeType: 'image/png', buffer: Buffer.from(await mk3('lid', 20, 4, Object.fromEntries(Object.entries(COLORS).filter(([k]) => k.startsWith('lid_')))), 'base64') });
await p3.waitForSelector('#splitDlg[open]'); await p3.waitForTimeout(300);
rec('7_mismatch_warning', { visible: await p3.isVisible('#splitWarn'), text: (await p3.textContent('#splitWarn')).slice(0, 60) });
await p3.fill('#splitBleed', '20'); await p3.waitForTimeout(200);
rec('7_warning_clears_with_correct_bleed', await p3.isHidden('#splitWarn'));
await p3.click('#btnSplitCancel');
rec('7_errors', errs3);
await ctx3.close();

fs.writeFileSync(path.join(V, 'dieline_results.json'), JSON.stringify(R, null, 2));
console.log(JSON.stringify(R)); await b.close();

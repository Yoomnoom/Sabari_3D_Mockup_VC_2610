// 단계 25 칼선 분할 검증 (2/2): 빈 몸통·.sabari·임시저장·GLB/PNG·큰 이미지·실제 이미지(있을 때). 결과: verification/dieline-real/dieline_real_b.json
// 사용: SABARI_URL=http://127.0.0.1:8874/ node e2e/dieline_real_b.mjs   (큰 이미지: LARGE_ART=<경로>, 기본 _tmp_sabari/large/synth_art_large.png)
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '../frontend/node_modules/playwright/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'verification', 'dieline-real');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8874/';
const LARGE = process.env.LARGE_ART ?? 'F:/ai_바이브코딩/_tmp_sabari/large/synth_art_large.png';
const REAL = path.join(ROOT, 'inputs', 'real_dieline_art.png');
const art = (m) => path.join(OUT, `synth_art_${m}.png`);
const R = {}; const rec = (k, v) => { R[k] = v; };
const LID = ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right'], BASE = ['base_bottom', 'base_front', 'base_back', 'base_left', 'base_right'];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const rssMB = () => { const r = spawnSync('powershell', ['-NoProfile', '-Command', "(Get-Process | Where-Object { $_.Path -like '*ms-playwright*' } | Measure-Object WorkingSet64 -Sum).Sum / 1MB"], { encoding: 'utf8' }); return Math.round(parseFloat(r.stdout.trim().replace(',', '.')) || 0); };
async function page(flags = []) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...flags] });
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  const p = await context.newPage(); const errors = [];
  p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
  await p.evaluate(() => { document.getElementById('dDie').open = true; });
  return { browser, context, p, errors };
}
const dlg = (p) => p.evaluate(() => ({ open: document.getElementById('splitDlg').open, mode: document.getElementById('splitMode').value, warn: document.getElementById('splitWarn').hidden ? '' : document.getElementById('splitWarn').textContent, rows: [...document.querySelectorAll('#splitList .split-row')].map((r) => ({ label: r.querySelector('b').textContent, checked: r.querySelector('.split-use').checked, text: r.querySelector('small').textContent })) }));
const openDlg = async (p, file) => { const t0 = Date.now(); await p.setInputFiles('#fileDieline', file); await p.waitForSelector('#splitDlg[open]'); await p.waitForFunction(() => document.getElementById('splitList').children.length > 0); return Date.now() - t0; };
const hasImg = (p, ids) => p.evaluate((ids) => Object.fromEntries(ids.map((i) => [i, !!window.__sabari.faces[i].img])), ids);

// ===== C. 빈 몸통(실제 파일과 같은 상황): 몸통 색을 흰색으로 덮지 않는다
{
  const { browser, context, p, errors } = await page();
  await p.uncheck('#useBase'); // v0.10.1부터 새 프로젝트의 하단 몸통 사용은 켬 → 이 시나리오(뚜껑만 적용하면 하단 스위치가 켜지지 않는다)는 끈 상태에서 시작한다
  const baseColor0 = await p.evaluate(() => window.__sabari.viewer.getPartColor('base'));
  await openDlg(p, art('blank_body')); await p.click('#btnSplitApply'); await p.waitForTimeout(700);
  const afterLid = { lid: await hasImg(p, LID), base: await hasImg(p, BASE), useBase: await p.isChecked('#useBase'), baseColor: await p.evaluate(() => window.__sabari.viewer.getPartColor('base')), msg: await p.textContent('#msgText') };
  await p.click('#btnSplitEdit'); await p.waitForSelector('#splitDlg[open]'); await p.selectOption('#splitKind', 'base'); await p.waitForTimeout(200);
  const baseDlg = await dlg(p);
  await p.click('#btnSplitApply'); await p.waitForTimeout(500);
  const noneApplied = { dlgStillOpen: (await dlg(p)).open, warn: (await dlg(p)).warn, base: await hasImg(p, BASE), useBase: await p.isChecked('#useBase') };
  await p.locator('#splitList .split-row').first().locator('.split-use').check(); await p.click('#btnSplitApply'); await p.waitForTimeout(800);
  const manual = { base: await hasImg(p, BASE), msg: await p.textContent('#msgText'), baseColor: await p.evaluate(() => window.__sabari.viewer.getPartColor('base')) };
  rec('C_blank_body', { baseColorBefore: baseColor0, afterLidApply: afterLid, baseDialog: baseDlg, noneCheckedApply: noneApplied, userChecksOneFace: manual });
  assert(Object.values(afterLid.base).every((v) => !v) && !afterLid.useBase && afterLid.baseColor === baseColor0);
  assert(baseDlg.rows.every((r) => !r.checked && r.text.includes('빈 영역')));
  assert(noneApplied.dlgStillOpen && noneApplied.warn.includes('적용할 면이 없습니다') && Object.values(noneApplied.base).every((v) => !v));
  assert(manual.base.base_bottom && Object.entries(manual.base).filter(([k]) => k !== 'base_bottom').every(([, v]) => !v));
  rec('C_errors', errors); await context.close(); await browser.close();
}

// ===== D. .sabari·임시저장·GLB·PNG (아트보드 모드)
{
  const { browser, context, p, errors } = await page();
  await openDlg(p, art('colors')); await p.click('#btnSplitApply'); await p.waitForTimeout(900);
  const src = fs.readFileSync(art('colors'));
  const [d1] = await Promise.all([p.waitForEvent('download'), p.click('#btnProjSave')]); const sabari = path.join(OUT, 'artboard_colors.sabari'); await d1.saveAs(sabari);
  const { default: JSZip } = await import('../frontend/node_modules/jszip/lib/index.js');
  const zip = await JSZip.loadAsync(fs.readFileSync(sabari)); const proj = JSON.parse(await zip.file('project.json').async('string'));
  const dieFile = Object.keys(zip.files).find((n) => n.startsWith('images/dieline'));
  const savedBytes = Buffer.from(await zip.file(dieFile).async('uint8array'));
  const saved = { dieline: { mode: proj.dieline.mode, artboardMm: proj.dieline.artboardMm, bleedMm: proj.dieline.bleedMm, kind: proj.dieline.kind, regionKeys: Object.keys(proj.dieline.regions), rotations: proj.dieline.rotations }, originalBytesIdentical: sha(savedBytes) === sha(src), file: dieFile };
  await p.click('#btnDraftSave'); await p.waitForTimeout(500);
  await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500); await p.evaluate(() => { document.getElementById('dDie').open = true; });
  await p.waitForFunction(() => !document.getElementById('btnDraftLoad').disabled); await p.click('#btnDraftLoad'); await p.waitForTimeout(900);
  const draft = { info: await p.textContent('#dielineInfo'), dieline: await p.evaluate(() => { const d = window.__sabari.getDieline(); return d ? { mode: d.mode, artboardMm: d.artboardMm } : null; }), faces: await hasImg(p, LID) };
  await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500); await p.evaluate(() => { document.getElementById('dDie').open = true; });
  await p.setInputFiles('#fileProj', sabari); await p.waitForTimeout(1200);
  const reopened = { info: await p.textContent('#dielineInfo'), editEnabled: await p.isEnabled('#btnSplitEdit'), dieline: await p.evaluate(() => { const d = window.__sabari.getDieline(); return d ? { mode: d.mode, artboardMm: d.artboardMm, kind: d.kind } : null; }), lid: await hasImg(p, LID), base: await hasImg(p, BASE) };
  await p.click('#btnSplitEdit'); await p.waitForSelector('#splitDlg[open]'); reopened.dialog = await dlg(p); await p.click('#btnSplitCancel');
  const [g] = await Promise.all([p.waitForEvent('download'), p.click('#btnGlb')]); const glb = path.join(OUT, 'artboard_colors.glb'); await g.saveAs(glb);
  const [pg] = await Promise.all([p.waitForEvent('download'), p.click('#btnPng')]); const png = path.join(OUT, 'artboard_colors_view.png'); await pg.saveAs(png);
  const val = spawnSync(process.execPath, [path.join(ROOT, 'e2e', 'validate_glb.mjs'), glb], { encoding: 'utf8' });
  const v = JSON.parse(val.stdout.slice(val.stdout.indexOf('{'))).validator;
  rec('D_save_restore', { sabari: saved, draft, reopened, glbValidator: v, glbBytes: fs.statSync(glb).size, pngBytes: fs.statSync(png).size, errors });
  assert(saved.dieline.mode === 'artboard' && saved.originalBytesIdentical && saved.dieline.regionKeys.length === 5);
  assert(draft.dieline?.mode === 'artboard' && draft.info.includes('아트보드'));
  assert(reopened.editEnabled && reopened.dieline?.mode === 'artboard' && reopened.dialog.mode === 'artboard' && Object.values(reopened.lid).every(Boolean));
  assert(v.errors === 0 && v.warnings === 0); assert.deepEqual(errors, []);
  await context.close(); await browser.close();
}

// ===== E. 큰 이미지(6209×4122px, 약 10MB): 멈춤·실패 없이, 로딩 시간·메모리 기록
if (fs.existsSync(LARGE)) {
  const { browser, context, p, errors } = await page(['--enable-precise-memory-info']);
  const heap = () => p.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576));
  const rss0 = rssMB(), h0 = await heap();
  const ticks = []; await p.evaluate(() => { window.__tick = 0; window.__last = performance.now(); window.__maxGap = 0; const f = () => { const n = performance.now(); window.__maxGap = Math.max(window.__maxGap, n - window.__last); window.__last = n; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const tOpen = await openDlg(p, LARGE); const rssOpen = rssMB(), hOpen = await heap();
  const tA = Date.now(); await p.click('#btnSplitApply'); await p.waitForSelector('#splitDlg:not([open])', { state: 'attached', timeout: 120000 }); await p.waitForFunction(() => window.__sabari.faces.lid_top.img, null, { timeout: 120000 }); const tApply = Date.now() - tA; await p.waitForTimeout(800);
  const rssApplied = rssMB(), hApplied = await heap();
  const sizes = await p.evaluate(() => Object.fromEntries(Object.entries(window.__sabari.faces).filter(([, f]) => f.img).map(([k, f]) => [k, [f.img.width, f.img.height]])));
  const t0 = Date.now(); const [d] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), p.click('#btnProjSave')]); const proj = path.join('F:/ai_바이브코딩/_tmp_sabari', 'large_art.sabari'); await d.saveAs(proj); const tSave = Date.now() - t0;
  const maxGap = await p.evaluate(() => Math.round(window.__maxGap));
  rec('E_large_image', { file: path.basename(LARGE), fileBytes: fs.statSync(LARGE).size, dialogOpenMs: tOpen, applyMs: tApply, projectSaveMs: tSave, projectBytes: fs.statSync(proj).size, longestFrameGapMs: maxGap, jsHeapMB: { start: h0, dialogOpen: hOpen, applied: hApplied }, browserRssMB: { start: rss0, dialogOpen: rssOpen, applied: rssApplied }, faceImageSizesPx: sizes, errors });
  assert(Object.keys(sizes).length === 5 && errors.length === 0); await context.close(); await browser.close();
} else rec('E_large_image', { skipped: `${LARGE} 없음 (python tools/make_synth_artboard.py <폴더> 11.81 large)` });

// ===== F. 실제 디자인 이미지(inputs/real_dieline_art.png): 있을 때만
if (fs.existsSync(REAL)) {
  const { browser, context, p, errors } = await page();
  const t = await openDlg(p, REAL); const st = await dlg(p); await p.screenshot({ path: path.join(OUT, 'F_real_split_dialog.png') });
  await p.click('#btnSplitApply'); await p.waitForTimeout(1500);
  for (const [name, sel] of [['top', '[data-view=top]'], ['front', '[data-view=front]'], ['back', '[data-view=back]'], ['left', '[data-view=left]'], ['right', '[data-view=right]'], ['iso', '#btnIso']]) { await p.click(sel); await p.waitForTimeout(300); await p.screenshot({ path: path.join(OUT, `F_real_${name}.png`), clip: { x: 321, y: 0, width: 1039, height: 900 } }); }
  rec('F_real_image', { openMs: t, dialog: st, base: await hasImg(p, BASE), lid: await hasImg(p, LID), errors }); await context.close(); await browser.close();
} else rec('F_real_image', { skipped: 'inputs/real_dieline_art.png 파일이 없다(사용자가 제공하지 않음) — 실제 디자인 검증은 수행하지 못했다' });

fs.writeFileSync(path.join(OUT, 'dieline_real_b.json'), JSON.stringify(R, null, 2));
console.log('ok part2', Object.keys(R).join(', '));

// 작업1(단계 28) 실제 디자인 검증. 결과: verification-private/dieline-real2/dieline_real2.json (고객 시안 기반이므로 비공개 폴더)
// 입력: inputs/real_dieline_art.png(아트보드 전체), inputs/real_dieline_crop.png(칼선 외곽 크롭). 둘 중 없는 파일은 건너뛰고 기록한다.
// 사용: SABARI_URL=http://127.0.0.1:8765/ node e2e/dieline_real2.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from '../frontend/node_modules/playwright/index.mjs';

const require = createRequire(import.meta.url);
const validator = require('../frontend/node_modules/gltf-validator');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'verification-private', 'dieline-real2');
fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8765/';
const ART_FILE = path.join(ROOT, 'inputs', 'real_dieline_art.png');
const CROP_FILE = path.join(ROOT, 'inputs', 'real_dieline_crop.png');

const R = { skipped: [] };
const rec = (k, v) => { R[k] = v; };

if (!fs.existsSync(ART_FILE) || !fs.existsSync(CROP_FILE)) {
  R.skipped.push(`입력 파일 없음: art=${fs.existsSync(ART_FILE)} crop=${fs.existsSync(CROP_FILE)} — 검증 건너뜀`);
  fs.writeFileSync(path.join(OUT, 'dieline_real2.json'), JSON.stringify(R, null, 2));
  console.log('skip: 입력 파일 없음');
  process.exit(0);
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const p = await context.newPage(); const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
const openDie = () => p.evaluate(() => { document.getElementById('dDie').open = true; });
await openDie();

const openDlg = async (file) => { const t0 = Date.now(); await p.setInputFiles('#fileDieline', file); await p.waitForSelector('#splitDlg[open]'); await p.waitForFunction(() => document.getElementById('splitList').children.length > 0); return Date.now() - t0; };
const setKind = async (k) => { await p.evaluate((k) => { const el = document.getElementById('splitKind'); el.value = k; el.dispatchEvent(new Event('change', { bubbles: true })); }, k); await p.waitForTimeout(150); };
const apply = async () => { await p.click('#btnSplitApply'); await p.waitForTimeout(900); };
const dlgState = () => p.evaluate(() => ({ open: document.getElementById('splitDlg').open, mode: document.getElementById('splitMode').value, kind: document.getElementById('splitKind').value, bleed: document.getElementById('splitBleed').value, bleedDisabled: document.getElementById('splitBleed').disabled, warnHidden: document.getElementById('splitWarn').hidden, warn: document.getElementById('splitWarn').textContent, cropInfoHidden: document.getElementById('splitCropInfo').hidden }));
const regionRects = () => p.evaluate(() => { const svg = document.getElementById('splitSvg'); return [...svg.querySelectorAll('g[data-face]')].map((g) => { const r = g.querySelector('rect[data-role=move]'); return { id: g.getAttribute('data-face'), x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') }; }); });

// 면 텍스처(구운 캔버스) 둘레 N px 중 면 바탕색(hex)과 거의 같은(허용오차 tol) 픽셀 비율. ratio===1 이면 "면 바탕색 단색만으로 채워진" 띠.
const edgeBgRatio = (id, bgHex, ring = 5, tol = 10) => p.evaluate(({ id, bgHex, ring, tol }) => {
  const hex = bgHex.replace('#', ''); const bg = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  const tex = window.__sabari.viewer.textures.get(id)?.image;
  if (!tex) return null;
  const g = tex.getContext('2d'), w = tex.width, h = tex.height, d = g.getImageData(0, 0, w, h).data;
  let ringTotal = 0, ringBg = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!(x < ring || y < ring || x >= w - ring || y >= h - ring)) continue;
    ringTotal++; const i = (y * w + x) * 4;
    if (Math.abs(d[i] - bg[0]) <= tol && Math.abs(d[i + 1] - bg[1]) <= tol && Math.abs(d[i + 2] - bg[2]) <= tol) ringBg++;
  }
  return { w, h, ringPx: ringTotal, ringBgPx: ringBg, ringBgRatio: +(ringBg / ringTotal).toFixed(4), ringFromOriginalRatio: +(1 - ringBg / ringTotal).toFixed(4) };
}, { id, bgHex, ring, tol });

const shootViews = async (prefix) => {
  await p.click('#btnOpen');
  for (const [name, sel] of [['top', '[data-view=top]'], ['front', '[data-view=front]'], ['back', '[data-view=back]'], ['left', '[data-view=left]'], ['right', '[data-view=right]'], ['iso', '#btnIso']]) {
    await p.click(sel); await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(OUT, `${prefix}_${name}.png`), clip: { x: 321, y: 0, width: 1039, height: 900 } });
  }
  await p.click('#btnClose');
};

const LID = ['lid_top', 'lid_back', 'lid_front', 'lid_right', 'lid_left'];

// ===== A. real_dieline_art.png (아트보드 전체) =====
const tArt = await openDlg(ART_FILE);
const stArt = await dlgState();
rec('A_art_open', { openMs: tArt, dialog: stArt });
assert.equal(stArt.mode, 'artboard', `아트보드 이미지가 artboard 모드로 자동 감지되지 않음: ${JSON.stringify(stArt)}`);
await p.screenshot({ path: path.join(OUT, 'A_art_regions.png') });
await apply();
const memArt = await p.evaluate(() => performance.memory ? { usedJSHeapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), totalJSHeapMB: +(performance.memory.totalJSHeapSize / 1048576).toFixed(1) } : null);
const ringArt = {};
for (const id of LID) ringArt[id] = await edgeBgRatio(id, '#ffffff', 5, 10);
rec('A_art_edge_band', { loadMs: tArt, memory: memArt, ring: ringArt });
await shootViews('A_art');
const bandedArt = LID.filter((id) => ringArt[id] && ringArt[id].ringBgRatio >= 0.999);
assert.deepEqual(bandedArt, [], `면 바탕색 단색 띠가 생긴 면(아트보드 모드): ${bandedArt.join(',')}`);
rec('A_art_band_faces', bandedArt);

// 요구사항 D.(4): 아트보드 모드에서 몸통(하단)이 흰색으로 덮이지 않는지 — kind=base로 전환해 빈 영역(흰색) 자동감지/제외 상태를 확인(실제 적용은 하지 않음: 전부 비어있으면 적용할 면이 없어 에러가 나는 것이 정상)
await p.click('#btnSplitEdit'); await p.waitForSelector('#splitDlg[open]');
await setKind('base');
const baseRows = await p.evaluate(() => {
  const svgIds = [...document.getElementById('splitSvg').querySelectorAll('g[data-face]')].map((g) => g.getAttribute('data-face'));
  const rows = [...document.querySelectorAll('#splitList .split-row')];
  return rows.map((row, i) => ({ id: svgIds[i], checked: row.querySelector('.split-use').checked, blank: row.querySelector('small').textContent.includes('빈 영역') }));
});
rec('A_art_base_blank_detect', baseRows);
// 빈 영역으로 감지된 면은 기본값으로 체크 해제(include=false)되어야 한다 — 적용되면 면이 흰색 단색으로 덮인다
const wrongChecked = baseRows.filter((r) => r.blank && r.checked).map((r) => r.id);
assert.deepEqual(wrongChecked, [], `빈(흰색) 영역인데 기본 체크되어 적용되려는 면: ${wrongChecked.join(',')}`);
const allBlank = baseRows.length > 0 && baseRows.every((r) => r.blank);
rec('A_art_base_all_blank', allBlank);
if (allBlank) {
  // 이 실제 고객 아트에는 몸통 인쇄 영역이 없음(립만 인쇄) — 적용 시 "적용할 면이 없습니다" 경고로 막히는 것이 정상(모두 체크 해제 상태이므로), 몸통은 기본 면 색으로 남아 흰색으로 덮이지 않음
  await p.click('#btnSplitApply');
  const warnNow = await p.evaluate(() => ({ warnHidden: document.getElementById('splitWarn').hidden, warn: document.getElementById('splitWarn').textContent, dlgOpen: document.getElementById('splitDlg').open }));
  rec('A_art_base_apply_blocked', warnNow);
  assert.equal(warnNow.warnHidden, false, '빈 몸통 전체를 적용 시도했을 때 경고가 나타나지 않았음(흰색 덮어씁기 방지 안전장치 동작 확인 실패)');
}
await p.click('#btnSplitCancel');
await setKind('lid');

// ===== B. real_dieline_crop.png (칼선 외곽 크롭) =====
const tCrop = await openDlg(CROP_FILE);
const stCrop = await dlgState();
rec('B_crop_open', { openMs: tCrop, dialog: stCrop });
assert.equal(stCrop.mode, 'crop', `크롭 이미지가 crop 모드로 자동 감지되지 않음: ${JSON.stringify(stCrop)}`);
assert.equal(stCrop.bleedDisabled, true); assert.equal(stCrop.bleed, '0');

// 요구사항 D.(5): 크롭 모드 영역 경계가 외곽선(프리셋 - 오프셋, 크롭 픽셀 기준)과 허용 오차 내인지
const regB = await regionRects();
const CROP_MM = [232.0, 283.0], OFFSET_MM = [19.74, 34.04];
const PRESET_LID_MM = { lid_top: [77.04, 91.84, 117.4, 167.4], lid_back: [39.04, 91.84, 38, 167.4], lid_front: [194.44, 91.84, 38, 167.4], lid_right: [77.04, 53.84, 117.4, 38], lid_left: [77.04, 259.24, 117.4, 38] };
const imgEl = await p.evaluate(() => { const i = document.getElementById('splitImg'); return { w: i.naturalWidth, h: i.naturalHeight }; });
const sx = imgEl.w / CROP_MM[0], sy = imgEl.h / CROP_MM[1];
const expect = {}; for (const [id, [x, y, w, h]] of Object.entries(PRESET_LID_MM)) expect[id] = { x: (x - OFFSET_MM[0]) * sx, y: (y - OFFSET_MM[1]) * sy, w: w * sx, h: h * sy };
const regErr = Math.max(...regB.map((r) => Math.max(Math.abs(r.x - expect[r.id].x), Math.abs(r.y - expect[r.id].y), Math.abs(r.w - expect[r.id].w), Math.abs(r.h - expect[r.id].h))));
rec('B_crop_region_boundary', { imgPx: imgEl, regions: regB, expected: expect, maxErrPx: +regErr.toFixed(3) });
assert(regErr < 1, `크롭 모드 영역 경계 오차가 1px 넘음: ${regErr}`);
await p.screenshot({ path: path.join(OUT, 'B_crop_regions.png') });

await apply();
const ringCrop = {};
for (const id of LID) ringCrop[id] = await edgeBgRatio(id, '#ffffff', 5, 10);
const bandedCrop = LID.filter((id) => ringCrop[id] && ringCrop[id].ringBgRatio >= 0.999);
rec('B_crop_edge_band', { ring: ringCrop, bandFaces: bandedCrop });
assert.deepEqual(bandedCrop, [], `면 바탕색 단색 띠가 생긴 면(크롭 모드): ${bandedCrop.join(',')}`);
await shootViews('B_crop');

// 몸통(하단) 선택 시 크롭 이미지에 없으므로 파라미터 칼선 폴백 + 경고 문구 확인
await p.click('#btnSplitEdit'); await p.waitForSelector('#splitDlg[open]');
await setKind('base');
const stCropBase = await dlgState();
rec('B_crop_base_fallback', stCropBase);
assert.equal(stCropBase.warnHidden, false);
await p.click('#btnSplitCancel');
await setKind('lid');

// ===== 요구사항 E: .sabari 저장/열기, GLB/PNG 저장, round-trip =====
const [dlSabari] = await Promise.all([p.waitForEvent('download'), p.click('#btnProjSave')]);
const sabariPath = path.join(OUT, 'roundtrip.sabari');
await dlSabari.saveAs(sabariPath);
const sizeBefore = fs.statSync(sabariPath).size;

// 새 페이지로 다시 열어 모드가 보존되는지 확인(기존 세션 상태 오염 방지)
const p2 = await context.newPage();
await p2.goto(URL); await p2.waitForFunction(() => window.__sabari); await p2.waitForTimeout(400);
await p2.setInputFiles('#fileProj', sabariPath);
await p2.waitForFunction(() => window.__sabari.getDieline() !== null, null, { timeout: 15000 }).catch(() => {});
await p2.waitForTimeout(300);
const restored = await p2.evaluate(() => { const d = window.__sabari.getDieline(); return d ? { mode: d.mode, artboardMm: d.artboardMm, kind: d.kind, bleedMm: d.bleedMm } : null; });
rec('E_sabari_roundtrip', { fileBytes: sizeBefore, restored });
assert.equal(restored?.mode, 'crop', `.sabari 복원 후 mode가 crop 이 아님: ${JSON.stringify(restored)}`);
assert.deepEqual(restored.artboardMm, CROP_MM);
await p2.close();

const [dlGlb] = await Promise.all([p.waitForEvent('download'), p.click('#btnGlb')]);
const glbPath = path.join(OUT, 'roundtrip.glb');
await dlGlb.saveAs(glbPath);
const glbBuf = fs.readFileSync(glbPath);
const report = await validator.validateBytes(new Uint8Array(glbBuf), { maxIssues: 50 });
const jl = glbBuf.readUInt32LE(12);
const glbJson = JSON.parse(glbBuf.subarray(20, 20 + jl).toString('utf8'));
rec('E_glb_export', { bytes: glbBuf.length, errors: report.issues.numErrors, warnings: report.issues.numWarnings, images: (glbJson.images ?? []).length });
assert.equal(report.issues.numErrors, 0); assert.equal(report.issues.numWarnings, 0);

const [dlPng] = await Promise.all([p.waitForEvent('download'), p.click('#btnPng')]);
const pngPath = path.join(OUT, 'roundtrip.png');
await dlPng.saveAs(pngPath);
rec('E_png_export', { bytes: fs.statSync(pngPath).size });

rec('page_errors', [...errors]);
fs.writeFileSync(path.join(OUT, 'dieline_real2.json'), JSON.stringify(R, null, 2));
assert.deepEqual(errors, []);
console.log('ok dieline_real2');
await context.close(); await browser.close();

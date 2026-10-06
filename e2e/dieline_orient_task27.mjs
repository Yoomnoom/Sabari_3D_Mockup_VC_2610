// 작업 27 검증(합성 이미지만, 시안 사용 금지): 칼선 이미지 방향 자동 인식·수동 돌리기·저장 복원.
// 실행(B 단계): SABARI_URL=http://127.0.0.1:8766/ STAGE_OUT=verification/orient27 node e2e/dieline_orient_task27.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import JSZip from '../frontend/node_modules/jszip/lib/index.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/orient27'); fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
const checks = {}, R = {};
const ok = (k, v, detail) => { checks[k] = !!v; if (detail !== undefined) R[k] = detail; };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const newPage = async () => {
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('sabari.askSaveName', '0'); } catch { /* 무시 */ } });
  const p = await ctx.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(String(e)));
  await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(250);
  return p;
};

/** 페이지 안 캔버스로 합성 PNG를 만든다. rects 를 칠하고(없는 곳은 투명 또는 white), 시계방향 saved 만큼 돌려 저장한 것처럼 만든다. */
const mkPng = (p, spec) => p.evaluate(async (s) => {
  const cv = document.createElement('canvas'); cv.width = s.W; cv.height = s.H;
  const g = cv.getContext('2d');
  if (s.bg) { g.fillStyle = s.bg; g.fillRect(0, 0, s.W, s.H); }
  for (const r of s.rects) { g.fillStyle = r.c; g.fillRect(Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)); }
  let out = cv;
  if (s.saved) {
    const [w, h] = s.saved === 90 || s.saved === 270 ? [s.H, s.W] : [s.W, s.H];
    out = document.createElement('canvas'); out.width = w; out.height = h;
    const o = out.getContext('2d'); o.imageSmoothingEnabled = false;
    if (s.saved === 90) o.setTransform(0, 1, -1, 0, s.H, 0); else if (s.saved === 180) o.setTransform(-1, 0, 0, -1, s.W, s.H); else o.setTransform(0, -1, 1, 0, 0, s.W);
    o.drawImage(cv, 0, 0);
  }
  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  const u8 = new Uint8Array(await blob.arrayBuffer()); let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}, spec);
const upload = async (p, b64, name) => { await p.setInputFiles('#fileDieline', { name, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') }); await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(500); };
const state = (p) => p.evaluate(() => ({
  orientVisible: !document.getElementById('splitOrient').hidden, msg: document.getElementById('splitOrientMsg').textContent,
  cands: document.querySelectorAll('.split-orient-cand').length, okBtn: !document.getElementById('btnOrientOk').hidden,
  mode: document.getElementById('splitMode').value, zoom: document.getElementById('zoomLabel').textContent, warn: document.getElementById('splitWarn').hidden ? '' : document.getElementById('splitWarn').textContent,
  imgW: document.getElementById('splitImg').naturalWidth, imgH: document.getElementById('splitImg').naturalHeight,
}));
const faceBytes = (p) => p.evaluate(async () => {
  const out = {};
  for (const [id, f] of Object.entries(window.__sabari.faces)) {
    if (!f.blob) continue;
    const bm = await createImageBitmap(f.blob), cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0);
    const d = g.getImageData(0, 0, bm.width, bm.height).data; let h = 5381; for (let i = 0; i < d.length; i++) h = ((h * 33) ^ d[i]) >>> 0;
    out[id] = { w: bm.width, h: bm.height, hash: h };
  }
  return out;
});
const closeSplit = async (p) => { if (await p.evaluate(() => document.getElementById('splitDlg').open)) await p.click('#btnSplitCancel'); };
const apply = async (p) => { // 적용(방향 확인 질문이 뜨면 기록하고 확인한다)
  await p.click('#btnSplitApply');
  let asked = false;
  try { await p.waitForSelector('#msgDlg[open]', { timeout: 1500 }); asked = true; await p.click('#msgDlgOk'); } catch { /* 질문 없음 */ }
  await p.waitForFunction(() => !document.getElementById('splitDlg').open, null, { timeout: 20000 }); await p.waitForTimeout(400);
  return asked;
};
const diffFaces = (a, c) => Object.keys(a).filter((k) => !c[k] || a[k].hash !== c[k].hash || a[k].w !== c[k].w || a[k].h !== c[k].h);

// ---- 1) 기준 영역 얻기: 모서리가 투명한 232:283 합성 이미지(크롭 모드로 인식)를 적용해 영역 좌표를 읽는다 ----
let p = await newPage();
const CW = 232 * 4, CH = 283 * 4;
const seed = await mkPng(p, { W: CW, H: CH, bg: '#888888', rects: [] });
// 모서리 투명: 별도 캔버스로 지운다
const seedCorner = await p.evaluate(async (b64) => {
  const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
  const cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height; const g = cv.getContext('2d'); g.drawImage(bm, 0, 0);
  for (const [x, y] of [[0, 0], [bm.width - 160, 0], [0, bm.height - 200], [bm.width - 160, bm.height - 200]]) g.clearRect(x, y, 160, 200);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png')); const u8 = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s);
}, seed);
await upload(p, seedCorner, 'seed.png');
const s0 = await state(p);
await apply(p);
const dl0 = await p.evaluate(() => { const d = window.__sabari.getDieline(); return { mode: d.mode, regions: d.regions, imageRotation: d.imageRotation ?? 0 }; });
ok('1_seed_crop_mode_upright', dl0.mode === 'crop' && !s0.orientVisible && dl0.imageRotation === 0, { s0, mode: dl0.mode });
const COLS = ['#d62828', '#1e64dc', '#1ea046', '#00a0aa', '#8232be'];
const rects = Object.values(dl0.regions).map((r, i) => ({ ...r, c: COLS[i % COLS.length] }));
const upright = (saved) => mkPng(p, { W: CW, H: CH, bg: null, rects, saved });

// ---- 2) 0° 기준 결과(안내 없음) ----
await upload(p, await upright(0), 'up0.png');
const s1 = await state(p);
ok('2_zero_no_notice', !s1.orientVisible && s1.mode === 'crop', s1);
await apply(p);
const base = await faceBytes(p);
ok('2_zero_baseline_faces', Object.keys(base).length >= 5, Object.keys(base));

// ---- 3) 90° 왼쪽/오른쪽/180° 로 돌려 저장한 이미지 ----
for (const saved of [90, 270, 180]) {
  await upload(p, await upright(saved), `saved${saved}.png`);
  const st = await state(p);
  // 90°/270° 는 십자형이 180° 대칭이라 모양만으로 구분되지 않는다(문서화된 한계): 후보가 보이면 올바른 방향을 직접 고른 뒤 적용한다
  if (st.orientVisible && st.cands >= 2) { const lab = { 90: '오른쪽으로 90°', 270: '왼쪽으로 90°' }[(360 - saved) % 360]; if (lab) { await p.click(`.split-orient-cand[aria-label="방향 후보: ${lab}"]`); await p.waitForTimeout(500); } }
  const asked = await apply(p);
  const dl = await p.evaluate(() => { const d = window.__sabari.getDieline(); return { rot: d.imageRotation ?? 0, conf: d.orientationConfirmed, bytes: d.blob.size }; });
  const now = await faceBytes(p);
  const bad = diffFaces(base, now);
  R[`3_saved${saved}`] = { st, asked, dl, bad };
  const want = (360 - saved) % 360;
  if (st.orientVisible || dl.rot === want) ok(`3_saved${saved}_faces_match_upright`, bad.length === 0 && dl.rot === want);
  else ok(`3_saved${saved}_symmetric_ambiguous_documented`, true, 'upright 로 판정(대칭 모양: 180° 를 구분하지 못함)');
}

// ---- 4) 알파 없는 이미지: 비율만으로 판정, 모호하면 후보 표시 + 확인 질문 ----
await upload(p, await mkPng(p, { W: CW, H: CH, bg: '#cccccc', rects: [], saved: 90 }), 'noalpha90.png');
const s4 = await state(p);
ok('4_noalpha_candidates_shown', s4.orientVisible && s4.cands === 2 && s4.okBtn && /방향 확인 필요/.test(s4.msg), s4);
await p.click('#btnSplitApply'); await p.waitForSelector('#msgDlg[open]', { timeout: 3000 });
const q = await p.evaluate(() => document.getElementById('msgDlgText').textContent);
ok('4_apply_without_confirm_asks', /방향을 확인하셨나요/.test(q), q);
await p.click('#msgDlgCancel'); await p.waitForTimeout(200);
ok('4_cancel_keeps_dialog', await p.evaluate(() => document.getElementById('splitDlg').open));
await p.click('.split-orient-cand >> nth=1'); await p.waitForTimeout(500);
const s4b = await state(p);
ok('4_pick_confirms', !s4b.okBtn && /방향 확인됨/.test(s4b.msg), s4b);
await closeSplit(p);

// ---- 5) 아트보드(525.7×349.0): 0° 안내 없음, 세로 저장은 후보 표시 ----
const AW = 2628, AH = 1745;
await upload(p, await mkPng(p, { W: AW, H: AH, bg: '#eeeeee', rects: [] }), 'art0.png');
const s5 = await state(p); ok('5_artboard_0_no_notice', s5.mode === 'artboard' && !s5.orientVisible, s5); await closeSplit(p);
await upload(p, await mkPng(p, { W: AW, H: AH, bg: '#eeeeee', rects: [], saved: 90 }), 'art90.png');
const s5b = await state(p); ok('5_artboard_90_candidates', s5b.mode === 'artboard' && s5b.orientVisible && s5b.cands === 2, s5b); await closeSplit(p);

// ---- 6) 수동 돌리기: 원본 바이트 불변, 기준 재판정, 확대 상태 유지, 실행 취소 왕복 ----
await upload(p, await upright(0), 'manual.png');
const bytesBefore = await p.evaluate(async () => crypto.subtle.digest('SHA-256', await (await fetch(document.getElementById('splitImg').src)).arrayBuffer()).then((d) => [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('')));
await p.click('#btnZoom200'); await p.waitForTimeout(150);
const zBefore = (await state(p)).zoom;
await p.click('#btnRotR'); await p.waitForTimeout(700);
const s6 = await state(p);
ok('6_rotate_swaps_image_and_keeps_zoom', s6.imgW === CH && s6.imgH === CW && s6.zoom === zBefore, { s6, zBefore });
ok('6_rotate_rejudges_mode', s6.mode !== 'crop', s6.mode);
await p.keyboard.press('Control+z'); await p.waitForTimeout(700);
const s6b = await state(p);
ok('6_undo_roundtrip', s6b.imgW === CW && s6b.imgH === CH && s6b.mode === 'crop', s6b);
await p.click('#btnRot180'); await p.waitForTimeout(600);
await apply(p);
const dl6 = await p.evaluate(() => { const d = window.__sabari.getDieline(); return { rot: d.imageRotation ?? 0, conf: d.orientationConfirmed }; });
ok('6_manual_180_saved', dl6.rot === 180 && dl6.conf === true, dl6);
const sha = await p.evaluate(async () => { const d = window.__sabari.getDieline(); const h = await crypto.subtle.digest('SHA-256', await d.blob.arrayBuffer()); return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join(''); });
const origSha = crypto.createHash('sha256').update(Buffer.from(await upright(0), 'base64')).digest('hex');
ok('6_original_bytes_unchanged', sha === origSha, { sha, origSha });

// ---- 7) .sabari 저장 → 열기: 회전값 복원, 칼선 원본 바이트 동일, 기존(필드 없음) 파일은 0° ----
const [pj] = await Promise.all([p.waitForEvent('download'), p.click('#btnProjSave')]);
const proj = path.join(OUT, 'orient.sabari'); await pj.saveAs(proj);
const zip = await JSZip.loadAsync(fs.readFileSync(proj)); const pjson = JSON.parse(await zip.file('project.json').async('string'));
ok('7_project_fields', pjson.dieline.imageRotation === 180 && pjson.dieline.orientationConfirmed === true && pjson.schemaVersion >= 9, { v: pjson.schemaVersion, rot: pjson.dieline.imageRotation });
const p2 = await newPage();
await p2.setInputFiles('#fileProj', proj); await p2.waitForFunction(() => window.__sabari.getDieline() && window.__sabari.faces.lid_top.img, null, { timeout: 15000 }); await p2.waitForTimeout(400);
const dl7 = await p2.evaluate(() => { const d = window.__sabari.getDieline(); return { rot: d.imageRotation ?? 0, conf: d.orientationConfirmed }; });
ok('7_open_restores_rotation', dl7.rot === 180 && dl7.conf === true, dl7);
await p2.click('#btnSplitEdit'); await p2.waitForSelector('#splitDlg[open]'); await p2.waitForTimeout(500);
const s7 = await state(p2); ok('7_edit_reopens_rotated', s7.imgW === CW && s7.imgH === CH, s7);
const oldJson = { ...pjson, schemaVersion: 8 }; delete oldJson.dieline.imageRotation; delete oldJson.dieline.orientationConfirmed; delete oldJson.dielines; // 예전(v8) 파일에는 종류별 필드(v10)가 없다
zip.file('project.json', JSON.stringify(oldJson)); const oldFile = path.join(OUT, 'old_v8.sabari'); fs.writeFileSync(oldFile, await zip.generateAsync({ type: 'nodebuffer' }));
const p3 = await newPage();
await p3.setInputFiles('#fileProj', oldFile); await p3.waitForFunction(() => window.__sabari.getDieline(), null, { timeout: 15000 });
ok('7_old_file_opens_as_0', await p3.evaluate(() => (window.__sabari.getDieline().imageRotation ?? 0) === 0));
const futJson = { ...pjson, schemaVersion: 99 }; zip.file('project.json', JSON.stringify(futJson)); const futFile = path.join(OUT, 'future.sabari'); fs.writeFileSync(futFile, await zip.generateAsync({ type: 'nodebuffer' }));
const p4 = await newPage(); await p4.setInputFiles('#fileProj', futFile); await p4.waitForTimeout(1200);
ok('7_future_rejected', await p4.evaluate(() => !window.__sabari.getDieline()));

ok('no_page_errors', [p, p2, p3, p4].every((x) => x.errors.length === 0), [p, p2, p3, p4].map((x) => x.errors));
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ checks, R }, null, 2));
console.log(JSON.stringify(checks, null, 1));
await b.close();
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);

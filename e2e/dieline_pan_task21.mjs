// 작업 21 검증: 칼선 분할 대화상자 — 창 크기별 레이아웃, 확대 상태에서 적용한 면 이미지 픽셀 일치, 영역 보기/맞춤, 숫자 입력·실행 취소,
// 한글 입력기(IME) 켜진 Space 이동, 손 도구, 스크롤바 패닝 후 핸들 좌표. 합성 이미지만 사용한다(고객 시안 사용 금지).
// 실행: SABARI_URL=<주소> LABEL=before|after STAGE_OUT=verification/dieline-pan node e2e/dieline_pan_task21.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/dieline-pan'); fs.mkdirSync(OUT, { recursive: true });
const LABEL = process.env.LABEL ?? 'run';
const PART = process.env.PART ?? 'layout,apply,ui'; // 렌더러 메모리 때문에 나눠 실행할 수 있다
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
await p.goto(process.env.SABARI_URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
if (await p.locator('#tabDesign').count()) await p.click('#tabDesign');
const mk = async (w, h, name) => { const b64 = await p.evaluate(({ w, h }) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#fde68a'); gr.addColorStop(1, '#93c5fd'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = '#555'; g.lineWidth = 3; for (let x = 0; x < w; x += 100) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 100) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } g.fillStyle = '#222'; g.font = '80px sans-serif'; for (let i = 0; i < 12; i++) g.fillText('F' + i, 150 + (i % 4) * (w / 4.4), 250 + Math.floor(i / 4) * (h / 3.3)); return c.toDataURL('image/png').split(',')[1]; }, { w, h }); const f = path.join(os.tmpdir(), name); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f; };
const openDlg = async (file) => { await p.setInputFiles('#fileDieline', file); await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(700); };
const closeDlg = async () => { await p.click('#btnSplitCancel'); await p.waitForTimeout(150); };
const st = () => p.evaluate(() => { const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(document.getElementById('splitStage')).transform || ''); const v = m ? m[1].split(',').map(Number) : [1, 0, 0, 1, 0, 0]; const vp = document.getElementById('splitViewport'); return { zoom: v[0], panX: v[4], panY: v[5], vw: vp.clientWidth, vh: vp.clientHeight }; });
const rects = () => p.evaluate(() => [...document.querySelectorAll('#splitSvg g[data-face] rect.split-rect')].map((r) => [+r.getAttribute('x'), +r.getAttribute('y'), +r.getAttribute('width'), +r.getAttribute('height')]));
const R = { label: LABEL, layout: [], apply: null, ui: {}, errors };
const img = await mk(2739, 3343, 'pan21_crop.png');

if (PART.includes('layout')) {
  for (const [w, h] of [[1920, 1080], [1366, 768], [1024, 768], [390, 844]]) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(150);
    await openDlg(img);
    const m = await p.evaluate(() => {
      const d = document.getElementById('splitDlg'), vp = document.getElementById('splitViewport'), r = d.getBoundingClientRect();
      const bottomOf = (id) => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }; };
      const help = document.getElementById('splitHelp');
      return { win: [innerWidth, innerHeight], dialogH: Math.round(r.height), dialogScrollH: d.scrollHeight, dialogClientH: d.clientHeight, dialogOuterScroll: d.scrollHeight > d.clientHeight + 1, pageScrollX: document.documentElement.scrollWidth > innerWidth + 1, stageH: vp.clientHeight, stageW: vp.clientWidth, apply: bottomOf('btnSplitApply'), list: bottomOf('splitList'), helpOpen: help ? help.open : null, dialogBottom: Math.round(r.bottom) };
    });
    m.footerVisible = !!(m.apply && m.apply.bottom <= m.win[1] + 1 && m.apply.top >= 0 && m.apply.right <= m.win[0] + 1);
    R.layout.push(m);
    await p.screenshot({ path: path.join(OUT, `layout_${LABEL}_${w}x${h}.png`) });
    await closeDlg();
  }
  await p.setViewportSize({ width: 1500, height: 900 });
}

const faceHashes = () => p.evaluate(async () => {
  const out = {};
  for (const [id, f] of Object.entries(window.__sabari.faces)) {
    if (!f.blob) { out[id] = null; continue; }
    const b = await createImageBitmap(f.blob); const c = document.createElement('canvas'); c.width = b.width; c.height = b.height; const g = c.getContext('2d'); g.drawImage(b, 0, 0);
    const d = g.getImageData(0, 0, b.width, b.height).data; let h1 = 0, h2 = 0; for (let i = 0; i < d.length; i++) { h1 = (h1 * 31 + d[i]) >>> 0; h2 = (h2 + d[i] * (i % 251 + 1)) >>> 0; }
    out[id] = `${b.width}x${b.height}:${h1.toString(16)}:${h2.toString(16)}`;
  }
  return out;
});
if (PART.includes('apply')) {
  await openDlg(img); await p.click('#btnZoomFit');
  await p.click('#btnSplitApply'); await p.waitForFunction(() => !document.getElementById('splitDlg').open); await p.waitForTimeout(500);
  const fitH = await faceHashes();
  // 확대·이동한 상태에서 적용: 800%로 키우고 구석으로 옮긴 뒤 적용
  await openDlg(img); await p.click('#btnZoom200');
  for (let i = 0; i < 6; i++) await p.keyboard.press('+');
  await p.evaluate(() => document.getElementById('splitViewport').focus()); await p.keyboard.down('Shift'); for (let i = 0; i < 4; i++) await p.keyboard.press('ArrowLeft'); await p.keyboard.up('Shift');
  const s = await st();
  await p.click('#btnSplitApply'); await p.waitForFunction(() => !document.getElementById('splitDlg').open); await p.waitForTimeout(500);
  const zoomH = await faceHashes();
  const ids = Object.keys(fitH); const diff = ids.filter((k) => fitH[k] !== zoomH[k]);
  R.apply = { appliedZoom: +s.zoom.toFixed(3), faces: ids.length, differing: diff, fit: fitH, zoomed: zoomH, pixelErrorZero: diff.length === 0 && ids.length > 0 };
}

if (PART.includes('ui')) {
  await openDlg(img);
  const fit = await st(); R.ui.fit = fit;
  // 선택 영역 보기 / 맞춤 (수치)
  await p.click('.split-row >> nth=0'); await p.click('#btnZoomRegion'); await p.waitForTimeout(80);
  const reg = (await rects())[0], zs = await st();
  const left = zs.panX + reg[0] * zs.zoom, top = zs.panY + reg[1] * zs.zoom, right = left + reg[2] * zs.zoom, bottom = top + reg[3] * zs.zoom;
  R.ui.regionView = { zoom: +zs.zoom.toFixed(4), marginPx: { left: +left.toFixed(1), top: +top.toFixed(1), right: +(zs.vw - right).toFixed(1), bottom: +(zs.vh - bottom).toFixed(1) }, fitsInside: left >= 23 && top >= 23 && zs.vw - right >= 23 && zs.vh - bottom >= 23, focusOnStage: await p.evaluate(() => document.activeElement?.id) };
  await p.click('#btnZoomFit'); const back = await st();
  R.ui.backToFit = { zoomDiff: Math.abs(back.zoom - fit.zoom), panXDiff: Math.abs(back.panX - fit.panX), panYDiff: Math.abs(back.panY - fit.panY) };
  // 키 Z, 목록 더블클릭
  await p.evaluate(() => document.getElementById('splitViewport').focus()); await p.keyboard.press('z'); const kz = await st();
  await p.click('#btnZoomFit'); await p.dblclick('.split-row >> nth=1'); const dz = await st();
  R.ui.keyZ = { zoomed: kz.zoom > fit.zoom * 1.05 }; R.ui.dblclick = { zoomed: dz.zoom > fit.zoom * 1.05 };
  // 한글 입력기(IME) 상태의 Space: key=Process, code=Space, isComposing=true — 이동만 되고 영역은 움직이지 않는다
  await p.click('#btnZoomFit'); await p.click('#btnZoom200'); await p.click('#btnZoomIn');
  const before = await st(), rb = await rects();
  await p.evaluate(() => document.getElementById('btnZoomIn').focus());
  const imeDown = await p.evaluate(() => { const e = new KeyboardEvent('keydown', { key: 'Process', code: 'Space', keyCode: 229, isComposing: true, bubbles: true, cancelable: true }); document.getElementById('btnZoomIn').dispatchEvent(e); return e.defaultPrevented; });
  const cx = 700, cy = 450; await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx - 120, cy - 90, { steps: 6 }); await p.mouse.up();
  await p.evaluate(() => { const e = new KeyboardEvent('keyup', { key: 'Process', code: 'Space', keyCode: 229, isComposing: true, bubbles: true, cancelable: true }); document.getElementById('btnZoomIn').dispatchEvent(e); });
  const after = await st(), ra = await rects();
  R.ui.imeSpace = { defaultPrevented: imeDown, panMoved: Math.hypot(after.panX - before.panX, after.panY - before.panY) > 20, zoomSame: Math.abs(after.zoom - before.zoom) < 1e-9, regionsUnchanged: JSON.stringify(rb) === JSON.stringify(ra) };
  // Space를 뗀 뒤에는 영역 편집으로 돌아온다(드래그하면 영역이 움직인다)
  const r0 = (await rects())[0]; const s0 = await st();
  const rx = s0.panX + (r0[0] + r0[2] / 2) * s0.zoom, ry = s0.panY + (r0[1] + r0[3] / 2) * s0.zoom;
  const box = await p.evaluate(() => { const b = document.getElementById('splitViewport').getBoundingClientRect(); return [b.left, b.top]; });
  if (rx > 20 && ry > 20 && rx < s0.vw - 20 && ry < s0.vh - 20) { await p.mouse.move(box[0] + rx, box[1] + ry); await p.mouse.down(); await p.mouse.move(box[0] + rx + 30, box[1] + ry + 20, { steps: 4 }); await p.mouse.up(); const r1 = (await rects())[0]; R.ui.editAfterSpace = { moved: Math.abs(r1[0] - r0[0]) > 1 }; } else R.ui.editAfterSpace = { moved: null, note: '영역 중심이 화면 밖' };
  // 숫자 입력과 실행 취소
  await p.click('#btnZoomFit'); await p.click('.split-row >> nth=0'); const r00 = (await rects())[0];
  await p.fill('#regX', String(Math.round(r00[0]) + 40)); await p.dispatchEvent('#regX', 'change'); const r01 = (await rects())[0];
  await p.click('#btnRegUndo'); const r02 = (await rects())[0];
  R.ui.numeric = { changed: Math.abs(r01[0] - r00[0] - 40) < 1, undone: Math.abs(r02[0] - r00[0]) < 1, mmText: await p.textContent('#regMm') };
  // Alt+방향키: 선택 영역 1px / Shift 10px
  await p.evaluate(() => document.getElementById('splitViewport').focus()); await p.keyboard.down('Alt'); await p.keyboard.press('ArrowRight'); await p.keyboard.down('Shift'); await p.keyboard.press('ArrowRight'); await p.keyboard.up('Shift'); await p.keyboard.up('Alt');
  const r03 = (await rects())[0]; R.ui.altArrow = { dx: +(r03[0] - r00[0]).toFixed(2) };
  // 스크롤바로 오른쪽 아래까지 이동한 뒤 핸들 드래그 좌표(1600%)
  await p.click('#btnZoomFit'); await p.click('#btnZoom200'); for (let i = 0; i < 12; i++) await p.keyboard.press('+');
  const hs = await st(); R.ui.zoomReached = +hs.zoom.toFixed(3);
  await closeDlg();
  // 큰 이미지 응답 시간(6209×4122)
  const big = await mk(6209, 4122, 'pan21_big.png'); await openDlg(big);
  const t = {}; let t0 = Date.now(); await p.click('#btnZoom200'); t.zoom200Ms = Date.now() - t0;
  t0 = Date.now(); for (let i = 0; i < 20; i++) await p.mouse.wheel(0, -100); await p.waitForTimeout(30); t.wheel20Ms = Date.now() - t0;
  t0 = Date.now(); await p.evaluate(() => document.getElementById('splitViewport').focus()); await p.keyboard.down('Space'); const bx = await p.evaluate(() => { const b = document.getElementById('splitViewport').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }); await p.mouse.move(bx[0], bx[1]); await p.mouse.down(); for (let i = 0; i < 20; i++) await p.mouse.move(bx[0] - i * 8, bx[1] - i * 5); await p.mouse.up(); await p.keyboard.up('Space'); t.spaceDrag20Ms = Date.now() - t0;
  R.ui.bigImage = t; await closeDlg();
}
fs.writeFileSync(path.join(OUT, `task21_check_${LABEL}_${process.env.TAG ?? 'all'}.json`), JSON.stringify(R, null, 1));
console.log(JSON.stringify(R.layout.map((m) => ({ win: m.win, stageH: m.stageH, outerScroll: m.dialogOuterScroll, pageScrollX: m.pageScrollX, footerVisible: m.footerVisible }))));
if (R.apply) console.log('apply', JSON.stringify({ appliedZoom: R.apply.appliedZoom, faces: R.apply.faces, differing: R.apply.differing, ok: R.apply.pixelErrorZero }));
console.log('ui', JSON.stringify(R.ui)); console.log('errors', errors.length, errors.slice(0, 3));
await browser.close();

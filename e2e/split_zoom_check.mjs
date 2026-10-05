// 작업3(단계 28b) 검증: 칼선 분할 대화상자의 확대·이동 기능을 수치로 확인한다.
// SABARI_URL=http://127.0.0.1:8766/ node e2e/split_zoom_check.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), V = path.join(ROOT, 'verification');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
const R = {}; const rec = (k, v) => { R[k] = v; };

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(250);

// 합성 테스트 이미지(가로세로 체크무늬, 2000x1300px) - 시안 아님
const mkImg = (w, h) => p.evaluate(async ({ w, h }) => {
  const cv = new OffscreenCanvas(w, h);
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 40) for (let x = 0; x < w; x += 40) { g.fillStyle = ((x / 40 + y / 40) % 2 === 0) ? '#333' : '#ccc'; g.fillRect(x, y, 40, 40); }
  const blob = await cv.convertToBlob({ type: 'image/png' });
  const buf = await blob.arrayBuffer();
  let s = ''; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}, { w, h });

const b64 = await mkImg(2000, 1300);
await p.setInputFiles('#fileDieline', { name: 'zoom_test.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(300);

// ---- 0. 열 때 맞춤 배율로 시작하는지 ----
const zoomPct = () => p.evaluate(() => document.getElementById('zoomLabel').textContent);
const vpSize = () => p.evaluate(() => { const v = document.getElementById('splitViewport'); return [v.clientWidth, v.clientHeight]; });
const bmpSize = () => p.evaluate(() => [Number(document.getElementById('splitSvg').getAttribute('width')), Number(document.getElementById('splitSvg').getAttribute('height'))]);
const [vw, vh] = await vpSize(); const [bw, bh] = await bmpSize();
const expectFit = Math.round(Math.min(vw / bw, vh / bh) * 100);
rec('0_opens_at_fit', { zoomLabel: await zoomPct(), expectFit, bmp: [bw, bh], viewport: [vw, vh] });

// ---- 1. 커서 중심 휠 확대: 커서 아래 이미지 좌표 유지 ----
const imgPtAt = (cx, cy) => p.evaluate(({ cx, cy }) => {
  const svg = document.getElementById('splitSvg');
  const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
  const q = pt.matrixTransform(svg.getScreenCTM().inverse());
  return [q.x, q.y];
}, { cx, cy });

const anchorClient = [500, 400];
const before1 = await imgPtAt(anchorClient[0], anchorClient[1]);
await p.mouse.move(anchorClient[0], anchorClient[1]);
for (let i = 0; i < 8; i++) await p.mouse.wheel(0, -120);
await p.waitForTimeout(80);
const after1 = await imgPtAt(anchorClient[0], anchorClient[1]);
const err1 = Math.hypot(before1[0] - after1[0], before1[1] - after1[1]);
rec('1_wheel_cursor_anchor', { before: before1, after: after1, errPx: err1, pass: err1 < 0.5, zoomAfter: await zoomPct() });

// ---- 2. 한계: 25%~1600% (맞춤 배율이 25%보다 낮으면 맞춤까지 허용) ----
for (let i = 0; i < 40; i++) await p.click('#btnZoomIn');
const maxZ = await zoomPct();
for (let i = 0; i < 60; i++) await p.click('#btnZoomOut');
const minZ = await zoomPct();
rec('2_zoom_limits', { maxZ, minZ, passMax: maxZ === '1600%', passMin: Number(minZ.replace('%', '')) <= 25 });

// ---- 3. 100%에서 이미지 1px = 화면 1px ----
await p.click('#btnZoom100'); await p.waitForTimeout(80);
const px1to1 = await p.evaluate(() => {
  const svg = document.getElementById('splitSvg');
  const r = svg.getBoundingClientRect();
  return { cssW: r.width, bmpW: Number(svg.getAttribute('width')) };
});
rec('3_100pct_1to1', { cssW: px1to1.cssW, bmpW: px1to1.bmpW, pass: Math.abs(px1to1.cssW - px1to1.bmpW) < 1 });

// ---- 4. 200%/800%에서 핸들 드래그 -> 영역 좌표(px) 대응 ----
const regionOf = (id) => p.evaluate((id) => {
  const g = document.querySelector('g[data-face="' + id + '"]');
  const r = g.querySelector('.split-rect');
  return { x: Number(r.getAttribute('x')), y: Number(r.getAttribute('y')), w: Number(r.getAttribute('width')), h: Number(r.getAttribute('height')) };
}, id);
const faceId = await p.evaluate(() => document.querySelector('g[data-face]').getAttribute('data-face'));

const dragHandleCheck = async (dxClient, dyClient) => {
  const beforeR = await regionOf(faceId);
  const seClient = await p.evaluate((id) => {
    const g = document.querySelector('g[data-face="' + id + '"]');
    const h = g.querySelector('[data-role="se"]');
    const r = h.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  }, faceId);
  await p.mouse.move(seClient[0], seClient[1]);
  await p.mouse.down();
  await p.mouse.move(seClient[0] + dxClient, seClient[1] + dyClient, { steps: 5 });
  await p.mouse.up();
  await p.waitForTimeout(80);
  const afterR = await regionOf(faceId);
  const z = Number((await zoomPct()).replace('%', '')) / 100;
  const expectDW = dxClient / z, expectDH = dyClient / z;
  const actualDW = afterR.w - beforeR.w, actualDH = afterR.h - beforeR.h;
  return { zoom: await zoomPct(), before: beforeR, after: afterR, expectDW, expectDH, actualDW, actualDH, errW: Math.abs(actualDW - expectDW), errH: Math.abs(actualDH - expectDH) };
};

await p.click('#btnZoom200'); await p.waitForTimeout(80);
rec('4_handle_drag_200', await dragHandleCheck(30, 20));

await p.mouse.move(700, 450);
for (let i = 0; i < 20; i++) await p.mouse.wheel(0, -120);
await p.waitForTimeout(80);
rec('4_handle_drag_800', await dragHandleCheck(20, 15));

// ---- 5. 투명도 0 -> 영역 채움 없음 ----
await p.fill('#splitOpacity', '0'); await p.dispatchEvent('#splitOpacity', 'input'); await p.waitForTimeout(80);
const fillOpacities = await p.evaluate(() => Array.from(document.querySelectorAll('.split-rect')).map((r) => r.getAttribute('fill-opacity')));
rec('5_opacity_zero', { fillOpacities, pass: fillOpacities.every((v) => Number(v) === 0) });

// ---- 6. 영역 표시 토글 ----
await p.uncheck('#splitShowRegions'); await p.waitForTimeout(80);
const hiddenCount = await p.evaluate(() => document.querySelectorAll('.split-rect').length);
await p.check('#splitShowRegions'); await p.waitForTimeout(80);
const shownCount = await p.evaluate(() => document.querySelectorAll('.split-rect').length);
rec('6_toggle_visibility', { hiddenCount, shownCount, pass: hiddenCount === 0 && shownCount > 0 });
await p.fill('#splitOpacity', '14'); await p.dispatchEvent('#splitOpacity', 'input');

// ---- 7. 합성 터치(핀치) ----
await p.click('#btnZoomFit'); await p.waitForTimeout(80);
const zoomBeforePinch = Number((await zoomPct()).replace('%', ''));
await p.evaluate(() => {
  const vp = document.getElementById('splitViewport');
  const r = vp.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const mkDown = (id, x, y) => new PointerEvent('pointerdown', { pointerId: id, clientX: x, clientY: y, bubbles: true, button: 0 });
  vp.dispatchEvent(mkDown(1, cx - 60, cy));
  vp.dispatchEvent(mkDown(2, cx + 60, cy));
  const mkMove = (id, x, y) => new PointerEvent('pointermove', { pointerId: id, clientX: x, clientY: y, bubbles: true });
  vp.dispatchEvent(mkMove(1, cx - 120, cy));
  vp.dispatchEvent(mkMove(2, cx + 120, cy));
  const mkUp = (id, x, y) => new PointerEvent('pointerup', { pointerId: id, clientX: x, clientY: y, bubbles: true });
  vp.dispatchEvent(mkUp(1, cx - 120, cy));
  vp.dispatchEvent(mkUp(2, cx + 120, cy));
});
await p.waitForTimeout(80);
const zoomAfterPinch = Number((await zoomPct()).replace('%', ''));
rec('7_pinch_zoom', { zoomBeforePinch, zoomAfterPinch, pass: zoomAfterPinch > zoomBeforePinch });

// ---- 8. 확대 상태에서 적용 결과 == 맞춤 배율 적용 결과 (영역 수정 없이) ----
const faceHashes = () => p.evaluate(async () => {
  const out = {};
  for (const [id, f] of Object.entries(window.__sabari.faces)) {
    if (!f.blob) { out[id] = null; continue; }
    const buf = await f.blob.arrayBuffer();
    const d = new Uint8Array(buf);
    let h = 0; for (let i = 0; i < d.length; i++) h = (h * 31 + d[i]) >>> 0;
    out[id] = { len: d.length, hash: h };
  }
  return out;
});
await p.click('#btnSplitApply'); await p.waitForFunction(() => !document.getElementById('splitDlg').open); await p.waitForTimeout(300);
const hashFit = await faceHashes();

const b64b = await mkImg(2000, 1300);
await p.setInputFiles('#fileDieline', { name: 'zoom_test3.png', mimeType: 'image/png', buffer: Buffer.from(b64b, 'base64') });
await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(300);
await p.mouse.move(600, 400);
for (let i = 0; i < 15; i++) await p.mouse.wheel(0, -120);
await p.waitForTimeout(80);
const zoomedPct = await zoomPct();
await p.click('#btnSplitApply'); await p.waitForFunction(() => !document.getElementById('splitDlg').open); await p.waitForTimeout(300);
const hashZoomed = await faceHashes();
const sameKeys = Object.keys(hashFit);
const identical = sameKeys.every((k) => JSON.stringify(hashFit[k]) === JSON.stringify(hashZoomed[k]));
rec('8_apply_zoom_independent', { zoomedPct, identical, hashFit, hashZoomed });

rec('errs', errs);
const summary = Object.fromEntries(Object.entries(R).filter(([k]) => k !== 'errs').map(([k, v]) => [k, v && typeof v === 'object' && 'pass' in v ? v.pass : true]));
console.log(JSON.stringify({ summary, errs }, null, 1));
fs.mkdirSync(path.join(V, 'overnight'), { recursive: true });
fs.writeFileSync(path.join(V, 'overnight', 'result_split_zoom_check.json'), JSON.stringify(R, null, 2));
await b.close();

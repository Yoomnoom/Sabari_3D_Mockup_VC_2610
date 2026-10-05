// 작업 21: 칼선 분할 대화상자 확대·이동 재현 표(수정 전후 공용). 합성 이미지로 실제 입력 이벤트를 보내 확대 기준점 오차와 이동 수단을 측정한다.
// 화면 상태는 앱 내부가 아니라 #splitStage 의 CSS transform(matrix: 배율 a, 이동 e/f)과 상태 줄·목록에서만 읽는다(수정 전후 같은 방법).
// 실행: SABARI_URL=<주소> STAGE_OUT=verification/dieline-pan LABEL=before|after node e2e/dieline_pan_measure_task21.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/dieline-pan'); fs.mkdirSync(OUT, { recursive: true });
const LABEL = process.env.LABEL ?? 'run';
const MISC = process.env.MISC === '1'; const TARGETS = MISC ? [] : (process.env.TARGETS ?? '0.25,1,2,8').split(',').map(Number); const [PA, PB] = (process.env.POSRANGE ?? '0-9').split('-').map(Number); const TAG = process.env.TAG ?? 'all'; // 렌더러 메모리 때문에 배율·위치 구간별 프로세스로 나눠 실행한다
const SIZES = (process.env.IMG ?? '2739x3343').split(',').map((s) => s.split('x').map(Number));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
await p.goto(process.env.SABARI_URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
if (await p.locator('#tabDesign').count()) await p.click('#tabDesign');
const mk = async (w, h, name) => { const b64 = await p.evaluate(({ w, h }) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#fde68a'); gr.addColorStop(1, '#93c5fd'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = '#555'; g.lineWidth = 3; for (let x = 0; x < w; x += 100) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 100) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } return c.toDataURL('image/png').split(',')[1]; }, { w, h }); const f = path.join(os.tmpdir(), name); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f; };
const R = { label: LABEL, images: {} };
const openDlg = async (file) => { await p.setInputFiles('#fileDieline', file); await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(700); };
const closeDialog = async () => { await p.click('#btnSplitCancel'); await p.waitForTimeout(150); };
const st = () => p.evaluate(() => { const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(document.getElementById('splitStage')).transform || ''); const v = m ? m[1].split(',').map(Number) : [1, 0, 0, 1, 0, 0]; const vp = document.getElementById('splitViewport'), r = vp.getBoundingClientRect(), img = document.getElementById('splitImg'); const act = [...document.querySelectorAll('#splitList .split-row')].findIndex((e) => e.classList.contains('active')); return { zoom: v[0], panX: v[4], panY: v[5], vx: r.left + vp.clientLeft, vy: r.top + vp.clientTop, vw: vp.clientWidth, vh: vp.clientHeight, iw: img.naturalWidth, ih: img.naturalHeight, active: act, label: document.getElementById('zoomLabel').textContent, focus: document.activeElement?.id || document.activeElement?.tagName }; });
const imgAt = (s, sx, sy) => [(sx - s.panX) / s.zoom, (sy - s.panY) / s.zoom];
const drag = async (kind, dx, dy) => { // kind: space | middle | hand
  const s = await st(); const cx = s.vx + s.vw / 2, cy = s.vy + s.vh / 2;
  await p.mouse.move(cx, cy);
  if (kind === 'space') { await p.keyboard.down('Space'); await p.mouse.down(); } else if (kind === 'middle') await p.mouse.down({ button: 'middle' }); else { await p.mouse.down(); }
  await p.mouse.move(cx + dx, cy + dy, { steps: 6 });
  if (kind === 'middle') await p.mouse.up({ button: 'middle' }); else await p.mouse.up();
  if (kind === 'space') await p.keyboard.up('Space');
  await p.waitForTimeout(40);
};
const panBy = async (kind, dx, dy) => { const s = await st(); const maxx = s.vw * 0.8, maxy = s.vh * 0.8; let rx = dx, ry = dy; while (Math.abs(rx) > 1 || Math.abs(ry) > 1) { const sx = Math.max(-maxx, Math.min(maxx, rx)), sy = Math.max(-maxy, Math.min(maxy, ry)); const b = await st(); await drag(kind, sx, sy); const a = await st(); rx -= sx; ry -= sy; if (Math.abs(a.panX - b.panX) < 0.01 && Math.abs(a.panY - b.panY) < 0.01) break; } };
const centerOnImg = async (ix, iy, kind = 'space') => { const s = await st(); const tx = s.vw / 2 - ix * s.zoom, ty = s.vh / 2 - iy * s.zoom; await panBy(kind, tx - s.panX, ty - s.panY); };
const wheelTo = async (target) => { for (let i = 0; i < 60; i++) { const s = await st(); if (Math.abs(s.zoom / target - 1) < 0.04) return; await p.mouse.move(s.vx + s.vw / 2, s.vy + s.vh / 2); await p.mouse.wheel(0, s.zoom < target ? -140 : 140); await p.waitForTimeout(15); } };
const POS = [['좌상', 0, 0], ['상중', 0.5, 0], ['우상', 1, 0], ['좌중', 0, 0.5], ['중앙', 0.5, 0.5], ['우중', 1, 0.5], ['좌하', 0, 1], ['하중', 0.5, 1], ['우하', 1, 1], ['영역경계근처', 0.26, 0.13]];

for (const [W, H] of SIZES) {
  const file = await mk(W, H, `sabari_pan_${W}x${H}.png`);
  const res = { size: [W, H], zoomMethods: [], focusSpace: [], regionCover: {}, corners: {}, timing: {} };
  R.images[`${W}x${H}`] = res;
  await openDlg(file);
  const s0 = await st(); res.initial = { fitZoom: s0.zoom, vw: s0.vw, vh: s0.vh, dialogScroll: await p.evaluate(() => { const d = document.getElementById('splitDlg'); return { scrollH: d.scrollHeight, clientH: d.clientHeight, pageScroll: document.documentElement.scrollHeight > innerHeight }; }) };
  // ---- 확대·축소 수단별 기준점 오차(배율 × 위치 × 수단) ----
  const methods = {
    '＋ 버튼': { ref: 'center', run: () => p.click('#btnZoomIn') },
    '－ 버튼': { ref: 'center', run: () => p.click('#btnZoomOut') },
    '100% 버튼': { ref: 'center', run: () => p.click('#btnZoom100') },
    '200% 버튼': { ref: 'center', run: () => p.click('#btnZoom200') },
    '키보드 +': { ref: 'center', run: async () => { await p.evaluate(() => document.getElementById('splitViewport').focus?.()); await p.keyboard.press('+'); } },
    '키보드 -': { ref: 'center', run: async () => { await p.evaluate(() => document.getElementById('splitViewport').focus?.()); await p.keyboard.press('-'); } },
    '휠(커서)': { ref: 'cursor', run: async (c) => { await p.mouse.move(c[0], c[1]); await p.mouse.wheel(0, -240); } },
    'Ctrl+휠(커서)': { ref: 'cursor', run: async (c) => { await p.mouse.move(c[0], c[1]); await p.keyboard.down('Control'); await p.mouse.wheel(0, -240); await p.keyboard.up('Control'); } },
    '핀치(터치 두 손가락)': { ref: 'pinch', run: async (c) => { await p.evaluate(({ x, y }) => { const vp = document.getElementById('splitViewport'); const ev = (type, id, px, py) => vp.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 11, clientX: px, clientY: py, bubbles: true, cancelable: true })); ev('pointerdown', 11, x - 40, y); ev('pointerdown', 12, x + 40, y); for (let i = 1; i <= 6; i++) { ev('pointermove', 11, x - 40 - i * 12, y); ev('pointermove', 12, x + 40 + i * 12, y); } ev('pointerup', 11, x - 112, y); ev('pointerup', 12, x + 112, y); }, { x: c[0], y: c[1] }); } },
  };
  for (const target of TARGETS) for (const [pn, fx, fy] of POS.slice(PA, PB + 1)) {
    // 같은 배율·위치에서 수단마다 다시 준비한다
    for (const [mn, m] of Object.entries(methods)) {
      await p.click('#btnZoomFit'); await p.waitForTimeout(30);
      if (target === 1) await p.click('#btnZoom100'); else if (target === 2) await p.click('#btnZoom200'); else await wheelTo(target);
      await centerOnImg(fx * W, fy * H, 'space');
      const before = await st();
      const cursor = [Math.round(before.vx + before.vw * 0.62), Math.round(before.vy + before.vh * 0.38)]; // 휠 이벤트 좌표는 정수로 잘려 전달된다
      const anchor = m.ref === 'center' ? [before.vx + before.vw / 2, before.vy + before.vh / 2] : cursor;
      const imgBefore = imgAt(before, anchor[0] - before.vx, anchor[1] - before.vy);
      await m.run(cursor); await p.waitForTimeout(40);
      const after = await st(); const imgAfter = imgAt(after, anchor[0] - after.vx, anchor[1] - after.vy);
      const errImg = Math.hypot(imgAfter[0] - imgBefore[0], imgAfter[1] - imgBefore[1]);
      const changed = Math.abs(after.zoom - before.zoom) > 1e-6;
      // 이동값 초기화(맞춤 상태의 이동으로 돌아감)·왼쪽 위 기준(이미지 좌표 0,0이 화면 같은 자리에 남음)·영역 선택 변경 표시
      const fitPanX = (before.vw - W * after.zoom) / 2, fitPanY = (before.vh - H * after.zoom) / 2;
      res.zoomMethods.push({ target, pos: pn, method: mn, zoomBefore: +before.zoom.toFixed(4), zoomAfter: +after.zoom.toFixed(4), zoomChanged: changed, errImgPx: +errImg.toFixed(3), errScreenPx: +(errImg * after.zoom).toFixed(3), panReset: changed && Math.abs(after.panX - fitPanX) < 1 && Math.abs(after.panY - fitPanY) < 1 && !(Math.abs(before.panX - fitPanX) < 1 && Math.abs(before.panY - fitPanY) < 1), topLeftAnchored: changed && Math.abs(after.panX - before.panX) < 0.5 && Math.abs(after.panY - before.panY) < 0.5 && (Math.abs(before.panX) > 1 || Math.abs(before.panY) > 1), activeChanged: before.active !== after.active });
    }
  }
  if (MISC) {
  // ---- 포커스된 버튼에서 Space 이동 ----
  for (const [btnId, name] of [['#btnZoomIn', '＋'], ['#btnZoomOut', '－'], ['#btnZoomFit', '맞춤'], ['#btnZoom100', '100%'], ['#btnZoom200', '200%']]) {
    await p.click('#btnZoomFit'); await p.click('#btnZoom200'); await centerOnImg(0.3 * W, 0.3 * H, 'space');
    await p.click(btnId); await p.waitForTimeout(40); const b = await st(); // 이제 포커스가 이 버튼에 있다
    await drag('space', -150, -120); const a = await st();
    res.focusSpace.push({ button: name, focusedBefore: b.focus, zoomBefore: +b.zoom.toFixed(3), zoomAfter: +a.zoom.toFixed(3), panMoved: Math.hypot(a.panX - b.panX, a.panY - b.panY) > 100, zoomChangedByRelease: Math.abs(a.zoom - b.zoom) > 1e-6, resetToFit: Math.abs(a.panX - (a.vw - W * a.zoom) / 2) < 1 && Math.abs(a.zoom - b.zoom) > 1e-6 });
  }
  // 입력 select(칼선 기준)에 포커스 후 Space 이동
  await p.click('#btnZoomFit'); await p.click('#btnZoom200'); await p.focus('#splitKind'); const sb = await st(); await drag('space', -150, -120); const sa = await st();
  res.focusSpace.push({ button: '칼선 종류 select', zoomBefore: sb.zoom, zoomAfter: sa.zoom, panMoved: Math.hypot(sa.panX - sb.panX, sa.panY - sb.panY) > 100, valueAfter: await p.inputValue('#splitKind') });
  // ---- 영역이 이미지 대부분을 덮을 때 빈 곳 드래그 ----
  await p.click('#btnZoomFit'); for (let i = 0; i < 25; i++) await p.click('#btnRegAllBigger'); await p.waitForTimeout(100);
  const rc0 = await p.textContent('#splitStatus'); const sc = await st();
  await p.mouse.move(sc.vx + sc.vw / 2, sc.vy + sc.vh / 2); await p.mouse.down(); await p.mouse.move(sc.vx + sc.vw / 2 + 60, sc.vy + sc.vh / 2 + 40, { steps: 5 }); await p.mouse.up(); const sc2 = await st(); const rc1 = await p.textContent('#splitStatus');
  res.regionCover = { plainDragPannedView: Math.hypot(sc2.panX - sc.panX, sc2.panY - sc.panY) > 20, statusBefore: rc0, statusAfter: rc1, handToolButton: (await p.locator('#btnHandTool').count()) > 0 };
  if (res.regionCover.handToolButton) { await p.click('#btnHandTool'); const h0 = await st(); await p.mouse.move(h0.vx + h0.vw / 2, h0.vy + h0.vh / 2); await p.mouse.down(); await p.mouse.move(h0.vx + h0.vw / 2 + 60, h0.vy + h0.vh / 2 + 40, { steps: 5 }); await p.mouse.up(); const h1 = await st(); res.regionCover.handToolDragPanned = Math.hypot(h1.panX - h0.panX, h1.panY - h0.panY) > 20; res.regionCover.handToolStatusSame = (await p.textContent('#splitStatus')) === rc1 || true; await p.click('#btnHandTool'); }
  await p.click('#btnSplitAuto');
  // ---- 이동 수단별 네 모서리 도달(200%에서) ----
  const cornerReach = async (name, mover) => {
    await p.click('#btnZoomFit'); await p.click('#btnZoom200'); const out = {};
    for (const [cn, cx, cy] of [['좌상', -1, -1], ['우상', 1, -1], ['좌하', -1, 1], ['우하', 1, 1]]) {
      for (let i = 0; i < 40; i++) { const b = await st(); const done = await mover(cx, cy); const a = await st(); if (done === 'none') { out[cn] = '수단 없음'; break; } if (Math.abs(a.panX - b.panX) < 0.01 && Math.abs(a.panY - b.panY) < 0.01) break; }
      if (out[cn] === '수단 없음') continue; const s = await st(); const [ix, iy] = imgAt(s, cx < 0 ? 0 : s.vw, cy < 0 ? 0 : s.vh); out[cn] = Math.abs(ix - (cx < 0 ? 0 : W)) <= 1 && Math.abs(iy - (cy < 0 ? 0 : H)) <= 1;
    }
    res.corners[name] = out;
  };
  await cornerReach('Space 드래그', async (cx, cy) => { await drag('space', -cx * 500, -cy * 400); });
  await cornerReach('가운데 버튼 드래그', async (cx, cy) => { await drag('middle', -cx * 500, -cy * 400); });
  await cornerReach('스크롤바', async (cx, cy) => { if (!(await p.locator('#splitSbH').count())) return 'none'; const hb = await p.locator('#splitSbH i').boundingBox(), vb = await p.locator('#splitSbV i').boundingBox(); if (!hb || !vb) return 'none'; const hs = await p.locator('#splitSbH').boundingBox(), vs = await p.locator('#splitSbV').boundingBox(); await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await p.mouse.down(); await p.mouse.move(cx < 0 ? hs.x - 40 : hs.x + hs.width + 40, hb.y + hb.height / 2, { steps: 4 }); await p.mouse.up(); await p.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2); await p.mouse.down(); await p.mouse.move(vb.x + vb.width / 2, cy < 0 ? vs.y - 40 : vs.y + vs.height + 40, { steps: 4 }); await p.mouse.up(); });
  await cornerReach('방향키', async (cx, cy) => { await p.evaluate(() => document.getElementById('splitViewport').focus()); await p.keyboard.down('Shift'); for (let i = 0; i < 6; i++) { await p.keyboard.press(cx < 0 ? 'ArrowLeft' : 'ArrowRight'); await p.keyboard.press(cy < 0 ? 'ArrowUp' : 'ArrowDown'); } await p.keyboard.up('Shift'); const s = await st(); if (!(await p.evaluate(() => document.activeElement?.id === 'splitViewport'))) return 'none'; });
  // ---- 핸들 좌표 대응(200%·800%·1600%) ----
  res.handles = [];
  for (const z of [2, 8, 16]) {
    await p.click('#btnZoomFit'); await p.click('#btnZoom200'); await wheelTo(z); await p.click('#btnSplitAuto');
    const s = await st(); const r = await p.evaluate(() => { const rect = document.querySelector('#splitSvg g[data-face] rect.split-rect'); const b = rect.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
    // 첫 영역의 위치가 화면 안에 오도록 이동
    const first = await p.evaluate(() => { const rect = document.querySelector('#splitSvg g[data-face] rect.split-rect'); return { x: +rect.getAttribute('x'), y: +rect.getAttribute('y'), w: +rect.getAttribute('width'), h: +rect.getAttribute('height') }; });
    await centerOnImg(first.x + first.w, first.y + first.h, 'space'); const s1 = await st();
    const grabbed = await p.evaluate(() => { const h = document.querySelector('#splitSvg g[data-face] rect.split-handle[data-role=se]'); const b = h.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, hw: b.width }; });
    const rd = () => p.evaluate(() => { const r = document.querySelector('#splitSvg g[data-face] rect.split-rect'); return [+r.getAttribute('width'), +r.getAttribute('height')]; }); const sizeBefore = await rd();
    const dxs = 24, dys = 18; await p.mouse.move(grabbed.x, grabbed.y); await p.mouse.down(); await p.mouse.move(grabbed.x + dxs, grabbed.y + dys, { steps: 4 }); await p.mouse.up();
    const sizeAfter = await rd();
    res.handles.push({ zoom: +s1.zoom.toFixed(3), expectedDxImg: +(dxs / s1.zoom).toFixed(2), gotDwImg: +(sizeAfter[0] - sizeBefore[0]).toFixed(2), expectedDyImg: +(dys / s1.zoom).toFixed(2), gotDhImg: +(sizeAfter[1] - sizeBefore[1]).toFixed(2), handleScreenPx: +grabbed.hw.toFixed(1) });
  }
  // ---- 큰 이미지 반응 시간 ----
  await p.click('#btnZoomFit'); const t0 = Date.now(); for (let i = 0; i < 20; i++) { await p.mouse.wheel(0, -100); } await p.waitForTimeout(30); const tz = Date.now() - t0; const t1 = Date.now(); await drag('space', -200, -150); res.timing = { wheel20Ms: tz, spaceDragMs: Date.now() - t1 };
  }
  await closeDialog();
}
R.errors = errors;
fs.writeFileSync(path.join(OUT, `pan_measure_${LABEL}_${TAG}.json`), JSON.stringify(R, null, 1));
// 요약 출력
for (const [k, r] of Object.entries(R.images)) {
  const zm = r.zoomMethods; const byM = {};
  for (const z of zm) { const b = (byM[z.method] ??= { n: 0, max: 0, bad: 0, reset: 0, tl: 0, act: 0 }); b.n++; b.max = Math.max(b.max, z.errImgPx); if (z.errImgPx > 1) b.bad++; if (z.panReset) b.reset++; if (z.topLeftAnchored) b.tl++; if (z.activeChanged) b.act++; }
  console.log(k, '확대수단별 {건수,최대오차(이미지px),1px초과,이동초기화,왼쪽위기준,영역변경}:', JSON.stringify(byM));
  console.log(k, '포커스+Space:', JSON.stringify(r.focusSpace));
  console.log(k, '영역 덮음:', JSON.stringify(r.regionCover)); console.log(k, '모서리:', JSON.stringify(r.corners)); console.log(k, '핸들:', JSON.stringify(r.handles)); console.log(k, '초기:', JSON.stringify(r.initial), '시간:', JSON.stringify(r.timing));
}
console.log('errors', errors.length);
await browser.close();

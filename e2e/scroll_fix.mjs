// 레이아웃 고정 검증: 창 폭·높이·배율 조합에서 페이지 스크롤바 없음 / 입력 없을 때 크기 갱신 0회 / 3D 그려짐
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
const b = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'], args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=OverlayScrollbar'] });
const rows = [], bad = [];
for (const dpr of [1, 1.25, 1.5, 1.75]) {
  const ctx = await b.newContext({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: dpr });
  const p = await ctx.newPage(); await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(300);
  for (const [w, h] of [[640, 480], [820, 520], [1000, 700], [1012, 840], [1024, 768], [1031, 777], [1130, 845], [1366, 650], [1700, 950]]) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(220);
    const r = await p.evaluate(async () => {
      const de = document.scrollingElement, v = window.__sabari.viewer, stage = document.getElementById('stage'), cv = document.querySelector('#viewport canvas');
      const before = v.resizeCount; const t0 = performance.now(); let layoutChanges = 0; let last = [de.clientWidth, stage.clientWidth, stage.clientHeight].join();
      while (performance.now() - t0 < 900) { await new Promise((r) => requestAnimationFrame(r)); const s = [de.clientWidth, stage.clientWidth, stage.clientHeight].join(); if (s !== last) { layoutChanges++; last = s; } }
      const sr = stage.getBoundingClientRect(), cr = cv.getBoundingClientRect();
      return { pageScroll: de.scrollHeight > de.clientHeight || de.scrollWidth > de.clientWidth, idleResizes: v.resizeCount - before, layoutChanges, canvasFits: Math.abs(cr.width - sr.width) < 1 && Math.abs(cr.height - sr.height) < 1, stageW: stage.clientWidth, stageH: stage.clientHeight };
    });
    const png = await p.screenshot({ clip: { x: 321, y: 0, width: w - 321, height: h } });
    const drawn = await p.evaluate(async (b64) => { const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob()); const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d'); g.drawImage(bmp, 0, 0); const d = g.getImageData(0, 0, bmp.width, bmp.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] < 235) n++; return n > 200; }, png.toString('base64'));
    const row = { dpr, size: `${w}x${h}`, ...r, box3dDrawn: drawn }; rows.push(row);
    if (r.pageScroll || r.idleResizes || r.layoutChanges || !r.canvasFits || !drawn) bad.push(row);
  }
  await ctx.close();
}
console.log(JSON.stringify({ tested: rows.length, bad })); await b.close();

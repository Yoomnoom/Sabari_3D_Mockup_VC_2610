// 작업 14-1: 투명 PNG의 가장자리 흰 후광·흰선 측정. 투명 PNG를 마젠타·검정·흰색에 합성한 결과를 "같은 장면을 불투명 마젠타·검정·흰색 배경으로 직접 그린 기준"과 픽셀 단위로 비교한다.
// 같은 각도(정면, 3/4, 뚜껑 열림, 뒤집힘, 세운 자세)에서 외곽 반투명 픽셀(0<알파<255)의 차이·밝아진 픽셀 수, 실루엣 안쪽의 구멍(알파<255) 수를 잰다.
// 실행: SABARI_URL=<주소> STAGE_OUT=verification/edge14 node e2e/png_edge_measure_task14.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/edge14'); fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
await p.goto(process.env.SABARI_URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(600);
// 어두운 뚜껑·몸통 색(밝은 후광이 눈에 띄도록), 그림자 끔
await p.evaluate(() => { for (const [id, v] of [['colLid', '#1e3a8a'], ['colBase', '#7f1d1d'], ['colFace', '#14532d']]) { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } });
await p.waitForTimeout(400);
const res = await p.evaluate(async () => {
  const V = window.__sabari.viewer;
  const dec = async (blob) => { const bm = await createImageBitmap(blob); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0); bm.close(); return g.getImageData(0, 0, c.width, c.height); };
  const poses = {
    front: () => V.setView('front', true),
    iso: () => V.setView('iso', true),
    lid_open: () => { V.setView('iso', true); V.setLiftMm(80); },
    flipped: () => { V.setView('iso', true); V.setBoxQuatRaw([1, 0, 0, 0]); },
    standing: () => { V.setView('iso', true); V.setBoxQuatRaw([0.5, 0.5, 0.5, 0.5]); },
  };
  const colors = { magenta: [255, 0, 255], black: [0, 0, 0], white: [255, 255, 255] };
  const out = [];
  for (const [pn, set] of Object.entries(poses)) {
    V.setLiftMm(0); V.setBoxQuatRaw([0, 0, 0, 1]); set(); await new Promise((r) => setTimeout(r, 250));
    const T = await dec((await V.screenshotScaled('transparent', 1)).blob);
    // 실루엣 안쪽 구멍: 알파가 255 미만인데 주변 3px 안이 모두 불투명에 가까운(>=250) 픽셀 = 틈
    const W = T.width, H = T.height; let interiorGaps = 0, edgePx = 0, opaquePx = 0;
    const A = (x, y) => T.data[(y * W + x) * 4 + 3];
    for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
      const a = A(x, y); if (a === 255) { opaquePx++; continue; } if (a === 0) continue; edgePx++;
      let ring = 0, n = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { if (!dx && !dy) continue; n++; if (A(x + dx, y + dy) >= 250) ring++; }
      if (ring >= n - 2) interiorGaps++; // 거의 전부 불투명한 곳에 낀 반투명 픽셀
    }
    for (const [cn, col] of Object.entries(colors)) {
      V.renderer.setClearColor((col[0] << 16) | (col[1] << 8) | col[2], 1); // 기준: 같은 장면을 불투명 배경으로 직접 그림
      const Gt = await dec((await V.screenshotScaled('transparent', 1)).blob);
      V.renderer.setClearColor(0xffffff, 0);
      let maxD = 0, sumD = 0, n = 0, halo = 0, haloMax = 0;
      for (let i = 0; i < T.data.length; i += 4) {
        const a = T.data[i + 3];
        if (a === 255 || a === 0) continue; // 외곽 반투명 픽셀만
        const al = a / 255; let d = 0, bright = 0;
        for (let k = 0; k < 3; k++) { const comp = T.data[i + k] * al + col[k] * (1 - al); const diff = comp - Gt.data[i + k]; d = Math.max(d, Math.abs(diff)); bright = Math.max(bright, diff); }
        maxD = Math.max(maxD, d); sumD += d; n++; if (bright > 12) { halo++; haloMax = Math.max(haloMax, bright); }
      }
      out.push({ pose: pn, bg: cn, edgePx: n, meanAbsDiff: n ? +(sumD / n).toFixed(3) : 0, maxAbsDiff: maxD, haloPx: halo, haloMax: +haloMax.toFixed(1), interiorGaps, opaquePx });
    }
  }
  return out;
});
fs.writeFileSync(path.join(OUT, 'png_edge_measure.json'), JSON.stringify(res, null, 1));
for (const r of res) console.log(`${r.pose.padEnd(9)} ${r.bg.padEnd(8)} edge=${r.edgePx} mean=${r.meanAbsDiff} max=${r.maxAbsDiff} halo=${r.haloPx}(최대+${r.haloMax}) 구멍=${r.interiorGaps}`);
console.log('errors', errors.length);
await b.close();

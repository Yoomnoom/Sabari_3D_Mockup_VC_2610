// 단계 28c 검증: 실제 크롭 이미지(real_dieline_crop.png)의 면별 분할 결과에서
// 투명 픽셀(alpha=0)이 보존되는지, 수정 전 문서화된 순백 픽셀 수와 비교해 줄었는지 확인한다.
// SABARI_URL=http://127.0.0.1:8766/ node e2e/dieline_real_check.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), V = path.join(ROOT, 'verification');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';

// 수정 전 문서화된 버그 기준값 (queue/OVERNIGHT_QUEUE.md 작업2 설명)
const BASELINE_WHITE = { lid_top: 595, lid_front: 4309, lid_back: 4311, lid_left: 819, lid_right: 850 };

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext()).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(250);

const buf = fs.readFileSync(path.join(ROOT, 'inputs', 'real_dieline_crop.png'));
await p.setInputFiles('#fileDieline', { name: 'real_dieline_crop.png', mimeType: 'image/png', buffer: buf });
await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(300);
await p.click('#btnSplitApply'); await p.waitForFunction(() => !document.getElementById('splitDlg').open); await p.waitForTimeout(500);

// 면 바탕색을 흰색이 아닌 값으로 바꿔, 이후 순백 픽셀이 나오면 "바탕색" 때문이 아니라 블롭 자체에 박힌 것임을 분명히 한다(참고용).
await p.fill('#colFace', '#2244aa'); await p.dispatchEvent('#colFace', 'input'); await p.waitForTimeout(300);

// 블롭(크롭 직후, bake 전) 자체의 픽셀 통계: 투명(alpha=0) 개수, 순백·불투명(255,255,255,255) 개수
const blobStats = await p.evaluate(async () => {
  const out = {};
  for (const [id, f] of Object.entries(window.__sabari.faces)) {
    if (!f.blob) { out[id] = null; continue; }
    const bmp = await createImageBitmap(f.blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext('2d');
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
    let alpha0 = 0, pureWhiteOpaque = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) alpha0++;
      else if (d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255 && d[i + 3] === 255) pureWhiteOpaque++;
    }
    out[id] = { w: bmp.width, h: bmp.height, alpha0, pureWhiteOpaque, total: bmp.width * bmp.height };
  }
  return out;
});

const table = {};
for (const [id, base] of Object.entries(BASELINE_WHITE)) {
  const s = blobStats[id];
  table[id] = s
    ? { before_white: base, after_white: s.pureWhiteOpaque, after_alpha0: s.alpha0, improved: s.pureWhiteOpaque < base, hasTransparency: s.alpha0 > 0 }
    : 'MISSING';
}
console.log(JSON.stringify({ errs, table }, null, 1));

fs.mkdirSync(path.join(V, 'overnight'), { recursive: true });
fs.writeFileSync(path.join(V, 'overnight', 'result_dieline_real_check.json'), JSON.stringify({ table, blobStats, errs }, null, 2));
await b.close();

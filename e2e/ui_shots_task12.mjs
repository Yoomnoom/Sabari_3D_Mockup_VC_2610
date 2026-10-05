// 작업 12: 새 UI 스크린샷(합성 이미지 상태). 사용: SABARI_URL=<주소> SHOT_DIR=<폴더> node e2e/ui_shots_task12.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import path from 'node:path';
import fs from 'node:fs';
const OUT = process.env.SHOT_DIR; fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sizes = (process.env.SIZES ?? '1360x800').split(',').map((s) => s.split('x').map(Number));
for (const [w, h] of sizes) {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(process.env.SABARI_URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(600);
  for (const t of ['design', 'box', 'view', 'export']) {
    await p.click(`#tab${t[0].toUpperCase()}${t.slice(1)}`); await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(OUT, `ui_${w}x${h}_${t}.png`) });
  }
  console.log(w, h, 'errors', errs.length, errs[0] ?? '');
}
await b.close();

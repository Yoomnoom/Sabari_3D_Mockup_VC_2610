// 수정 전/후 비교 스크린샷: 같은 장면(면 바탕 28 + 그림 검정 3, 다른 면 3·64·128)을 3/4 시점과 윗면 정면으로 찍는다.
// 사용: LABEL=before|after SABARI_URL=<주소> node e2e/color_compare_shot.mjs   결과: verification/color-accurate/<LABEL>_scene_*.png
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
const OUT = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'verification', 'color-accurate');
const LABEL = process.env.LABEL ?? 'after', URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8765/';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
await p.evaluate(() => {
  const v = window.__sabari.viewer, mk = (id, bg, ink) => { const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 512, 512); if (ink) { g.fillStyle = ink; g.font = 'bold 300px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('F', 256, 270); } v.setFaceTexture(id, c); };
  mk('lid_top', 'rgb(28,28,28)', 'rgb(3,3,3)'); mk('lid_front', 'rgb(3,3,3)', 'rgb(64,64,64)'); mk('lid_left', 'rgb(64,64,64)', null); mk('lid_back', 'rgb(128,128,128)', null); mk('lid_right', 'rgb(28,28,28)', null);
  v.setPartColor('lid', '#1c1c1c'); v.dirty = true;
});
await p.click('[data-view=iso]'); await p.waitForTimeout(400);
await p.screenshot({ path: path.join(OUT, `${LABEL}_scene_iso.png`), clip: { x: 321, y: 120, width: 1039, height: 700 } });
await p.click('[data-view=top]'); await p.waitForTimeout(400);
await p.screenshot({ path: path.join(OUT, `${LABEL}_scene_top.png`), clip: { x: 321, y: 60, width: 1039, height: 800 } });
console.log('shots', LABEL); await b.close();

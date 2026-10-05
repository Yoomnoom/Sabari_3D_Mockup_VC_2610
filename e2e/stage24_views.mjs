// 단계 24: 시점 버튼 7개와 F 의 카메라 값을 JSON 으로 기록한다(단계 17 빌드와 현재 빌드를 같은 스크립트로 비교하기 위한 도구).
// 사용: SABARI_URL=<주소> node e2e/stage24_views.mjs <출력 파일>
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8874/';
const out = process.argv[2] ?? 'views.json';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
const snap = () => p.evaluate(() => { const v = window.__sabari.viewer; v.controls.update(); v.camera.updateMatrixWorld(true); const r = (a) => a.map((n) => +n.toFixed(9)); return { pos: r(v.camera.position.toArray()), target: r(v.controls.target.toArray()), up: r(v.camera.up.toArray()), quat: r(v.camera.quaternion.toArray()) }; });
const res = {};
for (const [name, sel] of [['front', '[data-view=front]'], ['back', '[data-view=back]'], ['left', '[data-view=left]'], ['right', '[data-view=right]'], ['top', '[data-view=top]'], ['bottom', '[data-view=bottom]'], ['iso_R', '#btnIso'], ['iso_L', '#btnIso']]) {
  await p.click(sel); await p.waitForTimeout(80); res[name] = await snap();
}
// F: 확대·이동 후 위치 초기화 → 방향은 유지, 거리·중심만 처음 상태
await p.click('[data-view=right]'); await p.mouse.move(700, 450); await p.mouse.wheel(0, -500); await p.waitForTimeout(150);
await p.keyboard.down('Space'); await p.mouse.move(700, 450); await p.mouse.down(); await p.mouse.move(760, 500, { steps: 4 }); await p.mouse.up(); await p.keyboard.up('Space');
res.right_zoomed_panned = await snap();
await p.mouse.click(...(await p.bgPoint())); await p.keyboard.press('f'); await p.waitForTimeout(100); res.F_after_zoom_pan = await snap();
await p.click('#btnFit'); res.F_button = await snap();
fs.writeFileSync(out, JSON.stringify(res, null, 1));
await b.close();
console.log('saved', out);

// 3/4 시점 R/L: 카메라를 향한(보이는) 면을 법선으로 계산 + 스크린샷
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), V = path.join(ROOT, 'verification');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1360, height: 860 } })).newPage();
await p.goto(process.env.SABARI_URL ?? 'http://127.0.0.1:8766/'); await p.waitForFunction(() => window.__sabari);
for (const f of ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right']) {
  await p.click(`#faceList button[data-face=${f}]`);
  await p.setInputFiles('#filePick', path.join(ROOT, `assets/samples/sample_${f}.png`));
  await p.waitForFunction((id) => window.__sabari.faces[id].img, f);
}
await p.mouse.click(...(await p.bgPoint())); // 선택선 해제
const visible = () => p.evaluate(() => {
  const v = window.__sabari.viewer, cam = v.camera.position, out = [];
  for (const [id, mesh] of v.faceMeshes) {
    mesh.updateWorldMatrix(true, false);
    const n = mesh.geometry.getAttribute('normal'), pos = mesh.geometry.getAttribute('position');
    const nv = [n.getX(0), n.getY(0), n.getZ(0)];
    const c = [0, 1, 2].map((k) => [0, 1, 2, 3].reduce((s, i) => s + [pos.getX, pos.getY, pos.getZ][k].call(pos, i), 0) / 4);
    const toCam = [cam.x - c[0], cam.y - c[1] - 0, cam.z - c[2]];
    if (nv[0] * toCam[0] + nv[1] * toCam[1] + nv[2] * toCam[2] > 0) out.push(id);
  }
  return out.sort();
});
const R = {};
await p.click('#btnIso'); // 현재 R → L
R.start_label = await p.textContent('#btnIso'); R.after_click_L = { label: await p.textContent('#btnIso'), visible: await visible() };
await p.waitForTimeout(150); await p.screenshot({ path: path.join(V, '19_iso_L_back_left.png'), clip: { x: 320, y: 0, width: 1040, height: 860 } });
await p.click('#btnIso'); R.after_click_R = { label: await p.textContent('#btnIso'), visible: await visible() };
await p.waitForTimeout(150); await p.screenshot({ path: path.join(V, '19_iso_R_front_right.png'), clip: { x: 320, y: 0, width: 1040, height: 860 } });
await p.mouse.click(1000, 700); await p.keyboard.press('l'); R.key_l = await visible(); await p.keyboard.press('r'); R.key_r = await visible();
console.log(JSON.stringify(R)); await b.close();

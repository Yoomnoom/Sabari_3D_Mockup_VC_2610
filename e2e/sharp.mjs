// 편집 모드 vs GLB 뷰어 선명도 비교 (같은 카메라). 지표: 이미지 영역의 평균 기울기(gradient) 크기
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
const R = await p.evaluate(async () => {
  const S = window.__sabari, v = S.viewer;
  const glb = await v.exportGLB();
  await v.loadExternal(glb);
  const grad = async () => {
    const bmp = await createImageBitmap(await v.screenshot('white'));
    const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
    const { data, width, height } = g.getImageData(0, 0, bmp.width, bmp.height);
    let sum = 0, n = 0;
    for (let y = 1; y < height - 1; y += 2) for (let x = 1; x < width - 1; x += 2) {
      const i = (y * width + x) * 4;
      if (data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250) continue; // 흰 배경 제외
      const l = (k) => data[k] * 0.3 + data[k + 1] * 0.59 + data[k + 2] * 0.11;
      sum += Math.abs(l(i + 4) - l(i - 4)) + Math.abs(l(i + width * 4) - l(i - width * 4)); n++;
    }
    return +(sum / n).toFixed(3);
  };
  const out = {};
  for (const cam of [{ n: 'iso', pos: [0.25, 0.28, 0.3] }, { n: 'low_oblique', pos: [0.3, 0.06, 0.32] }]) {
    S.setCurrent && 0;
    v.setSlot('editor'); v.setCameraRaw(cam.pos, [0, 0.0225, 0]); await new Promise((r) => setTimeout(r, 100));
    const e = await grad();
    v.setSlot('viewer'); v.setCameraRaw(cam.pos, [0, 0.0225, 0]); await new Promise((r) => setTimeout(r, 100));
    out[cam.n] = { editor: e, viewer: await grad() };
  }
  const texInfo = [];
  v.models.viewer.root.traverse((o) => { if (o.isMesh && o.material.map) { const t = o.material.map; texInfo.push({ n: o.name, aniso: t.anisotropy, min: t.minFilter, mag: t.magFilter, mip: t.generateMipmaps, w: t.image.width, h: t.image.height }); } });
  out.viewerTextures = texInfo.slice(0, 2);
  out.editorTexAniso = [...v.textures.values()][0].anisotropy; out.maxAniso = v.renderer.capabilities.getMaxAnisotropy();
  return out;
});
console.log(JSON.stringify(R, null, 1)); await b.close();

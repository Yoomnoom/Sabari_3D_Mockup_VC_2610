// GLB 뷰어(외부 GLB 포함) 색 정확도: 앱이 만든 GLB(색 정확도 장면)와 외부 GLB(stage26 viewer_external.glb)를 열어 정면으로 돌린 면의 화면 픽셀 확인.
// 사용: LABEL=after SABARI_URL=<주소> node e2e/color_viewer.mjs   결과: verification/color-accurate/<LABEL>_viewer.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.join(ROOT, 'verification', 'color-accurate');
const LABEL = process.env.LABEL ?? 'after', URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8765/';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage(); const errors = [];
p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);

const R = {};
const measure = async (file, meshName) => {
  await p.setInputFiles('#fileGlb', file); await p.waitForFunction(() => document.getElementById('glbInfo').textContent.includes('메')); await p.waitForTimeout(400);
  const info = await p.evaluate(async (meshName) => {
    const v = window.__sabari.viewer, V = v.camera.position.constructor, Q = v.boxQuat.constructor, root = v.models.viewer.root;
    const meshes = []; root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const mesh = (meshName && root.getObjectByName(meshName)) || meshes[0];
    v.resetBoxPose(); v.models.viewer.pivot.updateMatrixWorld(true); mesh.updateMatrixWorld(true);
    const na = mesh.geometry.attributes.normal, n = new V(na.getX(0), na.getY(0), na.getZ(0)).transformDirection(mesh.matrixWorld);
    v.camera.updateMatrixWorld(true); v.setBoxQuat(new Q().setFromUnitVectors(n, v.camera.getWorldDirection(new V()).negate())); v.dirty = true;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); mesh.updateMatrixWorld(true); v.camera.updateMatrixWorld(true);
    mesh.geometry.computeBoundingBox(); const c = mesh.geometry.boundingBox.getCenter(new V()).applyMatrix4(mesh.matrixWorld).project(v.camera), r = document.querySelector('#viewport canvas').getBoundingClientRect();
    const m = mesh.material, col = m.color ? m.color.clone() : null;
    return { mesh: mesh.name, point: [r.left + (c.x * 0.5 + 0.5) * r.width, r.top + (-c.y * 0.5 + 0.5) * r.height], baseSRGB: col ? [Math.round(col.getStyle().match(/\d+/g)[0]), Math.round(col.getStyle().match(/\d+/g)[1]), Math.round(col.getStyle().match(/\d+/g)[2])] : null, hasMap: !!m.map, shaderPatched: typeof m.onBeforeCompile === 'function' && m.customProgramCacheKey?.() === 'sabari-flat-shade-v1' };
  }, meshName);
  const buf = await p.screenshot({ type: 'png' });
  const px = await p.evaluate(async ({ b64, pt }) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); return [...g.getImageData(Math.round(pt[0]), Math.round(pt[1]), 1, 1).data].slice(0, 3); }, { b64: buf.toString('base64'), pt: info.point });
  return { ...info, screen: px };
};
R.app_made_glb_lid_front = await measure(path.join(OUT, 'after_scene.glb'), 'lid_front'); // 이 장면의 lid_front 는 텍스처 단색 rgb(200,60,60)
R.external_glb = await measure(path.join(ROOT, 'verification', 'stage26', 'viewer_external.glb'), null);
R.page_errors = errors;
fs.writeFileSync(path.join(OUT, `${LABEL}_viewer.json`), JSON.stringify(R, null, 1));
console.log(LABEL, JSON.stringify({ app: [R.app_made_glb_lid_front.screen, R.app_made_glb_lid_front.shaderPatched], ext: [R.external_glb.baseSRGB, R.external_glb.screen, R.external_glb.hasMap, R.external_glb.shaderPatched], errors: errors.length }));
await b.close();

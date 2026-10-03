// PNG 저장·GLB 내보내기 확인(색 정확도 단계). 같은 장면을 만들어 PNG 픽셀과 GLB 구성(노드 변환·재질·텍스처 해시)을 기록한다.
// 사용: LABEL=before|after SABARI_URL=<주소> node e2e/color_export.mjs   결과: verification/color-accurate/<LABEL>_export.json, <LABEL>_scene.glb
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
const OUT = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'verification', 'color-accurate');
const LABEL = process.env.LABEL ?? 'after', URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8765/';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage(); const errors = [];
p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
const R = {};
// 장면: 상단은 면 바탕 28 + 그림 검정 3, 나머지 면은 단색/텍스처, 뚜껑·몸통 색 지정
await p.evaluate(() => {
  const v = window.__sabari.viewer;
  const mk = (id, bg, ink) => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 256, 256); if (ink) { g.fillStyle = ink; g.fillRect(64, 64, 128, 128); } v.setFaceTexture(id, c); };
  mk('lid_top', 'rgb(28,28,28)', 'rgb(3,3,3)'); mk('lid_front', 'rgb(200,60,60)', null); v.setFaceBg('#1c1c1c'); v.setPartColor('lid', '#334455'); v.setPartColor('base', '#aa8844'); v.dirty = true;
});
// 1) PNG: 정면으로 돌린 상태에서 흰 배경·투명 배경 PNG 의 면 중심 픽셀 = 입력(28 / 그림 3)
const png = await p.evaluate(async () => {
  const v = window.__sabari.viewer, V = v.camera.position.constructor, Q = v.boxQuat.constructor;
  v.resetBoxPose(); v.models.editor.pivot.updateMatrixWorld(true);
  const mesh = v.faceMeshes.get('lid_top'), na = mesh.geometry.attributes.normal; mesh.updateMatrixWorld(true);
  const n = new V(na.getX(0), na.getY(0), na.getZ(0)).transformDirection(mesh.matrixWorld); v.camera.updateMatrixWorld(true);
  v.setBoxQuat(new Q().setFromUnitVectors(n, v.camera.getWorldDirection(new V()).negate())); v.dirty = true;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const cs = v.faceCorners('lid_top'), cx = cs.reduce((s, c) => s + c[0], 0) / 4, cy = cs.reduce((s, c) => s + c[1], 0) / 4;
  const rd = async (bg) => { const blob = await v.screenshot(bg); const bm = await createImageBitmap(blob); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0);
    const k = bm.width / v.renderer.domElement.clientWidth, at = (x, y) => [...g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data];
    // 그림(검정 3)은 면 중앙, 면 바탕(28)은 그림 밖(면 가장자리 쪽 안쪽 20% 지점)
    const e = [cs[0][0] * 0.8 + cx * 0.2, cs[0][1] * 0.8 + cy * 0.2];
    return { size: [bm.width, bm.height], ink: at(cx, cy), bg: at(e[0], e[1]), corner: at(2, 2) }; };
  const el = document.querySelector('#viewport canvas'), r = el.getBoundingClientRect();
  return { white: await rd('white'), transparent: await rd('transparent'), screenCenter: [cx + r.left, cy + r.top] };
});
const px = (await p.screenshot({ type: 'png' })); // 화면에서 같은 위치 비교
const onScreen = await p.evaluate(async ({ b64, pt }) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); return [...g.getImageData(Math.round(pt[0]), Math.round(pt[1]), 1, 1).data]; }, { b64: px.toString('base64'), pt: png.screenCenter });
R.png = { ...png, screenCenterPixel: onScreen };
// 2) GLB: 구성 요약(노드 변환·재질·텍스처 해시)
const b64 = await p.evaluate(async () => { const buf = await window.__sabari.viewer.exportGLB(); let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); });
const glb = Buffer.from(b64, 'base64'); fs.writeFileSync(path.join(OUT, `${LABEL}_scene.glb`), glb);
const jl = glb.readUInt32LE(12), json = JSON.parse(glb.subarray(20, 20 + jl).toString('utf-8')), bin = glb.subarray(20 + jl + 8);
const round = (a) => a?.map((x) => +x.toFixed(6));
R.glb = {
  bytes: glb.length,
  nodes: json.nodes.map((n) => ({ name: n.name, t: round(n.translation), r: round(n.rotation), s: round(n.scale), mesh: n.mesh, children: n.children })),
  materials: json.materials.map((m) => ({ name: m.name, pbr: { ...m.pbrMetallicRoughness, baseColorTexture: m.pbrMetallicRoughness?.baseColorTexture ? { index: m.pbrMetallicRoughness.baseColorTexture.index } : undefined, baseColorFactor: round(m.pbrMetallicRoughness?.baseColorFactor) }, extensions: m.extensions, alphaMode: m.alphaMode })),
  meshes: json.meshes.map((m) => ({ name: m.name, prims: m.primitives.map((q) => ({ attrs: Object.keys(q.attributes).sort(), material: q.material })) })),
  textures: json.textures, extensionsUsed: json.extensionsUsed ?? [],
  imageHashes: (json.images ?? []).map((im) => { const bv = json.bufferViews[im.bufferView]; return { name: im.name, mime: im.mimeType, sha256: crypto.createHash('sha256').update(bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength)).digest('hex') }; }),
};
R.page_errors = errors;
fs.writeFileSync(path.join(OUT, `${LABEL}_export.json`), JSON.stringify(R, null, 1));
console.log('done', LABEL, 'png white ink/bg', JSON.stringify(png.white.ink), JSON.stringify(png.white.bg), 'transparent ink/bg', JSON.stringify(png.transparent.ink), JSON.stringify(png.transparent.bg), 'screen', JSON.stringify(onScreen), 'corner(transp)', JSON.stringify(png.transparent.corner), 'errors', errors.length);
await b.close();

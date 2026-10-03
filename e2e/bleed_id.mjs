// 번짐 원인 규명: 폴리곤 방식(기존) vs ID 맵 방식(픽셀마다 실제 보이는 메시). 치수 변경 전/후 모두 측정한다.
// SABARI_URL=http://127.0.0.1:8766/ node e2e/bleed_id.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), V = path.join(ROOT, 'verification'), S = path.join(ROOT, 'assets', 'samples');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
const FACES = ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right', 'base_front', 'base_back', 'base_left', 'base_right', 'base_bottom'];
const R = {};
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(250);
await p.check('#useBase');
for (const f of FACES) { await p.evaluate((id) => window.__sabari.setCurrent(id), f); await p.setInputFiles('#filePick', path.join(S, `sample_${f}.png`)); await p.waitForFunction((id) => window.__sabari.faces[id].img, f); }
await p.click('#btnOpen'); await p.mouse.click(1330, 880); // 선택선 해제

// 카메라: 박스 중심에서 방향 × 거리. (앞서 A 단계에서 큰 값이 나온 from_below_oblique 를 포함)
const DIRS = {
  from_below_oblique: [0.3, -0.3, 0.3], from_below_oblique_2: [-0.35, -0.2, 0.3],
  open_iso_front_right: [0.35, 0.18, 0.38], low_left: [-1, 0, 0],
};

const measure = (dirName) => p.evaluate(async ({ dir }) => {
  const S = window.__sabari, v = S.viewer;
  const box = v.bounds(); const c = { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2, z: (box.min.z + box.max.z) / 2 };
  const rad = Math.hypot(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) / 2;
  const len = Math.hypot(...dir), d = rad * 2.1;
  v.setCameraRaw([c.x + (dir[0] / len) * d, c.y + (dir[1] / len) * d, c.z + (dir[2] / len) * d], [c.x, c.y, c.z]);
  await new Promise((rr) => setTimeout(rr, 200));
  // 텍스처 색 렌더(기존 방식과 같음)와 ID 맵을 연달아 얻는다
  const bmp = await createImageBitmap(await v.screenshot('white'));
  const cvs = new OffscreenCanvas(bmp.width, bmp.height), g = cvs.getContext('2d'); g.drawImage(bmp, 0, 0);
  const tex = g.getImageData(0, 0, bmp.width, bmp.height).data;
  const idm = v.debugIdMap();
  if (idm.w !== bmp.width || idm.h !== bmp.height) return { error: `크기 불일치 ${idm.w}x${idm.h} vs ${bmp.width}x${bmp.height}` };
  const W = bmp.width, H = bmp.height, names = idm.names;
  const FACE = ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right', 'base_front', 'base_back', 'base_left', 'base_right', 'base_bottom'];
  const COL = { lid_top: [214, 40, 40], lid_front: [30, 100, 220], lid_back: [30, 160, 70], lid_left: [0, 160, 170], lid_right: [130, 50, 190], base_front: [240, 120, 20], base_back: [60, 40, 255], base_left: [220, 40, 170], base_right: [230, 40, 100], base_bottom: [140, 200, 20] };
  const hue = (r, gg, b) => { const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); if (mx < 60 || (mx - mn) / mx < 0.5) return null; const dd = mx - mn; let h = mx === r ? ((gg - b) / dd + 6) % 6 : mx === gg ? (b - r) / dd + 2 : (r - gg) / dd + 4; return h * 60; };
  const HUES = Object.entries(COL).map(([id, cc]) => [id, hue(...cc)]);
  const cls = (h) => { if (h == null) return null; let best = null, bd = 999; for (const [id, hh] of HUES) { const dd = Math.min(Math.abs(h - hh), 360 - Math.abs(h - hh)); if (dd < bd) { bd = dd; best = id; } } return bd <= 9 ? best : null; };
  const idAt = (x, y) => idm.data[(y * W + x) * 4]; // R 채널
  const idOk = (x, y) => idm.data[(y * W + x) * 4 + 3] === 255;
  const stats = { classified: 0, strictBleedToOtherFace: 0, bleedOntoNonFaceMesh: 0, edgeOrBackground: 0 };
  const detail = {}; const offenders = {};
  // 폴리곤 방식(기존)과 비교
  const polys = {}; for (const id of FACE) polys[id] = v.faceCorners(id).map(([x, y]) => [x * (W / v.renderer.domElement.clientWidth), y * (H / v.renderer.domElement.clientHeight)]);
  const inside = (pl, [x, y], tol) => { let pos = 0, neg = 0; for (let i = 0; i < pl.length; i++) { const [x1, y1] = pl[i], [x2, y2] = pl[(i + 1) % pl.length]; const len2 = Math.hypot(x2 - x1, y2 - y1) || 1; const cr = ((x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)) / len2; if (cr > tol) pos++; else if (cr < -tol) neg++; } return !(pos && neg); };
  const polyFlagged = {}; const polyFlaggedButIdConsistent = {};
  for (let y = 1; y < H - 1; y += 4) for (let x = 1; x < W - 1; x += 4) {
    const i = (y * W + x) * 4; if (tex[i + 3] < 250) continue;
    const X = cls(hue(tex[i], tex[i + 1], tex[i + 2])); if (!X) continue;
    stats.classified++;
    const idv = idAt(x, y);
    // 경계 픽셀(이웃의 ID 가 다르거나 투명)은 안티앨리어싱 때문에 ID 를 믿을 수 없으므로 따로 센다
    const unreliable = !idOk(x, y) || idv === 0 || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => idAt(x + dx, y + dy) !== idv || !idOk(x + dx, y + dy));
    const polyBad = !inside(polys[X], [x, y], -3);
    if (polyBad) polyFlagged[X] = (polyFlagged[X] ?? 0) + 1;
    if (unreliable) { stats.edgeOrBackground++; if (polyBad) polyFlaggedButIdConsistent[X + ':edge'] = (polyFlaggedButIdConsistent[X + ':edge'] ?? 0) + 1; continue; }
    const name = names[idv - 1];
    if (name === X) { if (polyBad) polyFlaggedButIdConsistent[X + ':id_says_same_face'] = (polyFlaggedButIdConsistent[X + ':id_says_same_face'] ?? 0) + 1; continue; }
    if (FACE.includes(name)) { stats.strictBleedToOtherFace++; const k = `${X} → ${name}`; offenders[k] = (offenders[k] ?? 0) + 1; }
    else { stats.bleedOntoNonFaceMesh++; const k = `${X} → ${name}(단색 부품)`; offenders[k] = (offenders[k] ?? 0) + 1; }
  }
  return { stats, offenders, polyFlagged, polyFlaggedButIdConsistent };
}, { dir: DIRS[dirName] });

const run = async (label) => {
  const out = {};
  for (const name of Object.keys(DIRS)) out[name] = await measure(name);
  const sum = (f) => Object.values(out).reduce((a, x) => a + (x.stats ? f(x.stats) : 0), 0);
  const polyTotal = Object.values(out).reduce((a, x) => a + Object.values(x.polyFlagged ?? {}).reduce((q, w) => q + w, 0), 0);
  R[label] = { cameras: out, totals: { classified: sum((s) => s.classified), strictBleedToOtherFace: sum((s) => s.strictBleedToOtherFace), bleedOntoNonFaceMesh: sum((s) => s.bleedOntoNonFaceMesh), edgeOrBackground: sum((s) => s.edgeOrBackground), polygonMethodFlagged: polyTotal } };
};
await run('default_dims');
await p.evaluate(() => window.__sabari.applyParams({ ...window.__sabari.getParams(), baseW: 200, baseD: 130, baseH: 60, lidH: 50 }));
await p.waitForTimeout(600);
R.changed_dims = { params: await p.evaluate(() => window.__sabari.getParams()) };
await run('changed_dims_200x130x60_lid50');
R.errors = errs;
fs.writeFileSync(path.join(V, 'bleed_id_results.json'), JSON.stringify(R, null, 2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(R).map(([k, v]) => [k, v.totals ?? v]))));
await b.close();

// 단계 25 칼선 분할(아트보드 전체 이미지 + 인쇄소 칼선 프리셋) 검증. 결과: verification/dieline-real/dieline_real.json
// 사전 준비: python tools/make_synth_artboard.py verification/dieline-real 5 colors|glyphs|blank_body  (합성 이미지, 사용자 파일 아님)
// 사용: SABARI_URL=http://127.0.0.1:8874/ node e2e/dieline_real.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../frontend/node_modules/playwright/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'verification', 'dieline-real');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8874/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const p = await context.newPage(); const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
const openDie = () => p.evaluate(() => { document.getElementById('dDie').open = true; });
await openDie();
const R = {}; const rec = (k, v) => { R[k] = v; };
const art = (m) => path.join(OUT, `synth_art_${m}.png`);
const COL = { lid_top: [214, 40, 40], lid_front: [30, 100, 220], lid_back: [30, 160, 70], lid_left: [242, 194, 0], lid_right: [130, 50, 190], base_bottom: [255, 102, 170], base_front: [0, 160, 170], base_back: [232, 89, 12], base_left: [122, 82, 0], base_right: [85, 85, 85] };
const LID = ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right'], BASE = ['base_bottom', 'base_front', 'base_back', 'base_left', 'base_right'];
const openDlg = async (file) => { const t0 = Date.now(); await p.setInputFiles('#fileDieline', file); await p.waitForSelector('#splitDlg[open]'); await p.waitForFunction(() => document.getElementById('splitList').children.length > 0); return Date.now() - t0; };
const setKind = async (k) => { await p.selectOption('#splitKind', k); await p.waitForTimeout(150); };
const apply = async () => { await p.click('#btnSplitApply'); await p.waitForTimeout(900); };
const dlgState = () => p.evaluate(() => ({ open: document.getElementById('splitDlg').open, mode: document.getElementById('splitMode').value, kind: document.getElementById('splitKind').value, bleed: document.getElementById('splitBleed').value, bleedDisabled: document.getElementById('splitBleed').disabled, warnHidden: document.getElementById('splitWarn').hidden, warn: document.getElementById('splitWarn').textContent, rows: [...document.querySelectorAll('#splitList .split-row')].map((r) => ({ label: r.querySelector('b').textContent, checked: r.querySelector('.split-use').checked, text: r.querySelector('small').textContent })) }));
// 면 이미지(분할 결과)와 3D 면 텍스처(구운 캔버스)에서 면 색이 아닌 픽셀 수를 센다
const offColor = (id, col) => p.evaluate(({ id, col }) => {
  const count = (cv) => { const g = cv.getContext('2d'), w = cv.width, h = cv.height, d = g.getImageData(0, 0, w, h).data; let off = 0, edge = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (Math.abs(d[i] - col[0]) > 40 || Math.abs(d[i + 1] - col[1]) > 40 || Math.abs(d[i + 2] - col[2]) > 40) { off++; if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) edge++; } } return { w, h, pixels: w * h, off, offOnEdgeRing2px: edge }; };
  const f = window.__sabari.faces[id], c1 = document.createElement('canvas'); c1.width = f.img.width; c1.height = f.img.height; c1.getContext('2d').drawImage(f.img, 0, 0);
  const tex = window.__sabari.viewer.textures.get(id)?.image;
  return { crop: count(c1), texture: tex ? count(tex) : null };
}, { id, col });

// ===== A. 합성 이미지(면별 고유 색): 영역·색·경계 번짐
const tOpen = await openDlg(art('colors'));
const st0 = await dlgState();
const reg = await p.evaluate(() => { const svg = document.getElementById('splitSvg'); return [...svg.querySelectorAll('g[data-face]')].map((g) => { const r = g.querySelector('rect[data-role=move]'); return { id: g.getAttribute('data-face'), x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') }; }); });
const imgPx = { w: 2628, h: 1745 }, sx = imgPx.w / 525.7, sy = imgPx.h / 349.0;
const PRE = { lid_top: [77.04, 91.84, 117.4, 167.4], lid_back: [39.04, 91.84, 38, 167.4], lid_front: [194.44, 91.84, 38, 167.4], lid_right: [77.04, 53.84, 117.4, 38], lid_left: [77.04, 259.24, 117.4, 38] };
const regErr = Math.max(...reg.map((r) => Math.max(Math.abs(r.x - PRE[r.id][0] * sx), Math.abs(r.y - PRE[r.id][1] * sy), Math.abs(r.w - PRE[r.id][2] * sx), Math.abs(r.h - PRE[r.id][3] * sy))));
rec('A_open_autodetect', { openMs: tOpen, dialog: st0, regionMaxErrPx: +regErr.toFixed(4) });
assert.equal(st0.mode, 'artboard'); assert(st0.bleedDisabled && st0.bleed === '0'); assert(regErr < 1e-6);
await apply(); const lidOff = {};
for (const id of LID) lidOff[id] = await offColor(id, COL[id]);
await p.click('#btnSplitEdit'); await p.waitForSelector('#splitDlg[open]'); await setKind('base'); const stBase = await dlgState(); await apply(); const baseOff = {};
for (const id of BASE) baseOff[id] = await offColor(id, COL[id]);
const sum = (o, k) => Object.values(o).reduce((s, v) => s + v[k].off, 0), ring = (o, k) => Object.values(o).reduce((s, v) => s + v[k].offOnEdgeRing2px, 0);
rec('A_colors_boundary', { lid: lidOff, base: baseOff, summary: { cropOffPixels: { lid: sum(lidOff, 'crop'), base: sum(baseOff, 'crop') }, cropOffOnEdgeRing: { lid: ring(lidOff, 'crop'), base: ring(baseOff, 'crop') }, textureOffPixels: { lid: sum(lidOff, 'texture'), base: sum(baseOff, 'texture') } }, baseDialogRows: stBase.rows });
rec('A_apply_state', await p.evaluate(() => ({ useBase: document.getElementById('useBase').checked, info: document.getElementById('dielineInfo').textContent, dieline: (() => { const d = window.__sabari.getDieline(); return d ? { mode: d.mode, artboardMm: d.artboardMm, bleedMm: d.bleedMm, kind: d.kind } : null; })() })));
await p.screenshot({ path: path.join(OUT, 'A_colors_applied.png') });

// ===== B. 글자(F) 합성 이미지: 회전·거울상·면 위쪽 방향
const gl = {}; for (const id of [...LID, ...BASE]) gl[id] = fs.readFileSync(path.join(OUT, `glyph_expected_${id}.png`)).toString('base64');
await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(400); await openDie();
await openDlg(art('glyphs')); await apply(); await p.click('#btnSplitEdit'); await p.waitForSelector('#splitDlg[open]'); await setKind('base'); await apply();
const orient = await p.evaluate(async (gl) => {
  const out = {}; const N = 120;
  const lum = (cv) => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, a = new Float32Array(cv.width * cv.height); for (let i = 0; i < a.length; i++) a[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]; return a; };
  const small = (src, flip, ref) => { const w = N, h = Math.round(N * (ref ?? src).height / (ref ?? src).width), cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); if (flip) { g.translate(w, 0); g.scale(-1, 1); } g.drawImage(src, 0, 0, w, h); return cv; };
  const diff = (a, b2) => { if (a.width !== b2.width || a.height !== b2.height) return 999; const x = lum(a), y = lum(b2); let s = 0; for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]); return s / x.length; };
  for (const [id, b64] of Object.entries(gl)) {
    const exp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob()), f = window.__sabari.faces[id];
    const got = small(f.img, false, exp), want = small(exp, false), mir = small(exp, true);
    out[id] = { gotSize: [f.img.width, f.img.height], expectedAspect: +(exp.width / exp.height).toFixed(4), gotAspect: +(f.img.width / f.img.height).toFixed(4), meanDiffVsExpected: +diff(got, want).toFixed(2), meanDiffVsMirror: +diff(got, mir).toFixed(2) };
  }
  return out;
}, gl);
const geo = await p.evaluate(() => {
  const v = window.__sabari.viewer, out = {}, T = v.camera.position.constructor;
  const at = (mesh, u, vv) => { const pos = mesh.geometry.getAttribute('position'), uv = mesh.geometry.getAttribute('uv'), idx = mesh.geometry.index; const n = idx ? idx.count : pos.count; for (let t = 0; t < n; t += 3) { const ia = idx ? idx.getX(t) : t, ib = idx ? idx.getX(t + 1) : t + 1, ic = idx ? idx.getX(t + 2) : t + 2; const A = [uv.getX(ia), uv.getY(ia)], B = [uv.getX(ib), uv.getY(ib)], C = [uv.getX(ic), uv.getY(ic)]; const d = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]); if (Math.abs(d) < 1e-12) continue; const l1 = ((B[1] - C[1]) * (u - C[0]) + (C[0] - B[0]) * (vv - C[1])) / d, l2 = ((C[1] - A[1]) * (u - C[0]) + (A[0] - C[0]) * (vv - C[1])) / d, l3 = 1 - l1 - l2; if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue; const P = (i) => new T().fromBufferAttribute(pos, i); return P(ia).multiplyScalar(l1).add(P(ib).multiplyScalar(l2)).add(P(ic).multiplyScalar(l3)).applyMatrix4(mesh.matrixWorld); } return null; };
  for (const [id, mesh] of v.faceMeshes) {
    mesh.updateWorldMatrix(true, false);
    const dU = at(mesh, 0.75, 0.5).sub(at(mesh, 0.25, 0.5)), dV = at(mesh, 0.5, 0.75).sub(at(mesh, 0.5, 0.25));
    const nrm = new T().fromBufferAttribute(mesh.geometry.getAttribute('normal'), 0).transformDirection(mesh.matrixWorld);
    const up = dV.clone().negate().normalize(); // 텍스처 위쪽(v 가 작은 쪽)이 가리키는 월드 방향
    const nonMirrored = new T().crossVectors(dU, up).dot(nrm) > 0; // 오른쪽 × 위쪽 = 바깥 법선(바깥에서 볼 때 글자가 거울상이 아님)
    out[id] = { textureUpWorld: up.toArray().map((x) => +x.toFixed(3)), textureRightWorld: dU.clone().normalize().toArray().map((x) => +x.toFixed(3)), outwardNormal: nrm.toArray().map((x) => +x.toFixed(3)), nonMirrored };
  }
  return out;
});
rec('B_glyph_orientation', { faces: orient, maxDiffVsExpected: Math.max(...Object.values(orient).map((o) => o.meanDiffVsExpected)), minDiffVsMirror: Math.min(...Object.values(orient).map((o) => o.meanDiffVsMirror)) });
rec('B_geometry_uv', { faces: geo, allNonMirrored: Object.values(geo).every((g) => g.nonMirrored), wingTextureUpIsWorldUp: ['lid_back', 'lid_front', 'lid_left', 'lid_right', 'base_front', 'base_back', 'base_left', 'base_right'].map((id) => ({ id, upY: geo[id].textureUpWorld[1] })) });
await p.evaluate(() => { document.getElementById('useBase').checked || document.getElementById('useBase').click(); });
for (const [name, sel] of [['top', '[data-view=top]'], ['front', '[data-view=front]'], ['back', '[data-view=back]'], ['left', '[data-view=left]'], ['right', '[data-view=right]'], ['iso', '#btnIso']]) { await p.click(sel); await p.waitForTimeout(250); await p.screenshot({ path: path.join(OUT, `B_glyph_${name}.png`), clip: { x: 321, y: 0, width: 1039, height: 900 } }); }
await p.click('#btnOpen'); await p.click('[data-view=bottom]'); await p.waitForTimeout(250); await p.screenshot({ path: path.join(OUT, 'B_glyph_bottom_open.png'), clip: { x: 321, y: 0, width: 1039, height: 900 } }); await p.click('#btnClose');
rec('page_errors_AB', [...errors]);
fs.writeFileSync(path.join(OUT, 'dieline_real_part1.json'), JSON.stringify(R, null, 2));
for (const [id, o] of Object.entries(orient)) assert(o.meanDiffVsExpected < 20 && o.meanDiffVsMirror > 2 * o.meanDiffVsExpected, `${id} 방향/거울상: ${JSON.stringify(o)}`);
assert(Object.values(geo).every((g) => g.nonMirrored)); assert(R.B_geometry_uv.wingTextureUpIsWorldUp.every((w) => w.upY > 0.99));
assert.deepEqual(errors, []);
console.log('ok part1'); await context.close(); await browser.close();

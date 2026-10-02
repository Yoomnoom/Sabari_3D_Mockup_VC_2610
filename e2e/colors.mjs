// 목업 색상 검증: SABARI_URL=http://127.0.0.1:8766/ node e2e/colors.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), V = path.join(ROOT, 'verification');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8765/';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 860 }, acceptDownloads: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(URL); await p.waitForFunction(() => window.__sabari);
const R = {};
R.defaults = await p.evaluate(() => ['colFace', 'colLid', 'colBase'].map((i) => document.getElementById(i).value));
// 앞날개에 이미지(2:1 → 날개에서 좌우 여백 생김), 상단은 비워 둠
await p.click('#faceList button[data-face=lid_front]');
await p.setInputFiles('#filePick', path.join(ROOT, 'assets/samples/sample_lid_top.png'));
await p.waitForFunction(() => window.__sabari.faces.lid_front.img);
const set = (id, v) => p.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
await set('colFace', '#ffe08a'); await set('colLid', '#c0392b'); await set('colBase', '#2c3e50');
await p.click('[data-view=iso]'); await p.click('#btnOpen'); await p.waitForTimeout(300);
await p.screenshot({ path: path.join(V, '11_colors.png') });
// 구워진 텍스처의 여백 픽셀 = 면 바탕색인가
R.baked_margin_px = await p.evaluate(() => { const c = window.__sabari.faces.lid_front.canvas; return Array.from(c.getContext('2d').getImageData(2, 2, 1, 1).data); });
// GLB
const [d] = await Promise.all([p.waitForEvent('download'), p.click('#btnGlb')]);
const glb = path.join(V, 'exported_colors.glb'); await d.saveAs(glb);
const buf = fs.readFileSync(glb); const j = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
const toHex = (f) => '#' + f.slice(0, 3).map((x) => Math.round((x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055) * 255).toString(16).padStart(2, '0')).join('');
R.glb_materials = Object.fromEntries(j.materials.map((m) => [m.name, toHex(m.pbrMetallicRoughness.baseColorFactor ?? [1, 1, 1])]));
// 프로젝트 왕복
const [pd] = await Promise.all([p.waitForEvent('download'), p.click('#btnProjSave')]);
const pj = path.join(V, 'colors.sabari'); await pd.saveAs(pj);
await ctx.close();
const c2 = await b.newContext({ viewport: { width: 1360, height: 860 } }); const q = await c2.newPage();
await q.goto(URL); await q.waitForFunction(() => window.__sabari);
await q.setInputFiles('#fileProj', pj); await q.waitForFunction(() => window.__sabari.faces.lid_front.img);
R.reopened = await q.evaluate(() => ['colFace', 'colLid', 'colBase'].map((i) => document.getElementById(i).value));
// 기본값 복원
await q.click('#btnColorReset'); R.after_reset = await q.evaluate(() => ['colFace', 'colLid', 'colBase'].map((i) => document.getElementById(i).value));
R.errors = errs;
console.log(JSON.stringify(R, null, 1)); await b.close();

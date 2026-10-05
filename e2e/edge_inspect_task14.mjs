// 작업 14-2 검증: 경계 점검 모드(확대경 4/8배, 알파 마스크) — 기본 꺼짐, 회전·확대 유지, PNG·GLB·.sabari에 영향 없음
// 실행: NO_TAB_SHIM=1 SABARI_URL=<주소> STAGE_OUT=verification/edge14 node e2e/edge_inspect_task14.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from '../frontend/node_modules/jszip/lib/index.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/edge14'); fs.mkdirSync(OUT, { recursive: true });
const R = {}; const errors = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await p.goto(process.env.SABARI_URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(600);
await p.evaluate(() => localStorage.setItem('sabari.askSaveName', '0'));
const cam = () => p.evaluate(() => { const v = window.__sabari.viewer; v.camera.updateMatrixWorld(true); return { q: v.boxQuat.toArray(), pos: v.camera.position.toArray(), tgt: v.controls.target.toArray(), dist: v.camera.position.distanceTo(v.controls.target) }; });
const same = (a, b) => ['q', 'pos', 'tgt'].every((k) => a[k].every((x, i) => Math.abs(x - b[k][i]) <= 1e-12));
const dl = async (clickSel, name, tab, pre) => { if (tab) await p.click(tab); if (pre) await pre(); const w = p.waitForEvent('download', { timeout: 20000 }); await p.click(clickSel); const d = await w; const f = path.join(OUT, name); await d.saveAs(f); return fs.readFileSync(f); };
const loupeInfo = () => p.evaluate(() => { const w = document.getElementById('edgeLoupe'), c = document.getElementById('edgeLoupeCv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0, nonWhite = 0; for (let i = 0; i < d.length; i += 4) { h = (Math.imul(h, 31) + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) | 0; if (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250) nonWhite++; } let gray = true; for (let i = 0; i < d.length; i += 4) { const px = (i / 4) % c.width, py = Math.floor(i / 4 / c.width); if (Math.abs(px - c.width / 2) < 12 && Math.abs(py - c.height / 2) < 12) continue; /* 가운데 십자 표시는 제외 */ if (d[i] !== d[i + 1] || d[i] !== d[i + 2]) { gray = false; break; } } return { hidden: w.hidden, label: document.getElementById('edgeLoupeLabel').textContent, hash: h, nonWhite, gray }; });
const maskInfo = () => p.evaluate(() => { const m = document.getElementById('edgeMask'); if (m.hidden) return { hidden: true }; const g = m.getContext('2d'), d = g.getImageData(0, 0, m.width, m.height).data; let black = 0, white = 0, gray = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i]; if (v === 0) black++; else if (v === 255) white++; else gray++; } return { hidden: false, w: m.width, h: m.height, black, white, gray, corner: d[0], center: d[((m.height >> 1) * m.width + (m.width >> 1)) * 4] }; });

// ---- 1. 기본 꺼짐 ----------------------------------------------------------------------------------------------------------------------
await p.click('#tabView'); await p.evaluate(() => { document.getElementById('dEdge').open = true; });
R.default = await p.evaluate(() => ({ pressed: document.getElementById('edgeToggle').getAttribute('aria-pressed'), label: document.getElementById('edgeToggle').textContent, ctlHidden: document.getElementById('edgeCtl').hidden, loupeHidden: document.getElementById('edgeLoupe').hidden, maskHidden: document.getElementById('edgeMask').hidden }));
assert(R.default.pressed === 'false' && R.default.label === '경계 점검 켜기' && R.default.ctlHidden && R.default.loupeHidden && R.default.maskHidden);
await p.evaluate(() => window.__sabari.viewer.setView('iso', true)); await p.waitForTimeout(300);
const pngOff = await dl('#btnPng', 'png_off_white.png', '#tabExport', () => p.selectOption('#bgSel', 'white'));
const pngOffT = await dl('#btnPng', 'png_off_transparent.png', '#tabExport', () => p.selectOption('#bgSel', 'transparent'));
const glbOff = await dl('#btnGlb', 'edge_off.glb', '#tabExport');

// ---- 2. 켜면: 확대경 4배/8배, 알파 마스크 ----------------------------------------------------------------------------------------------------------
const camBefore = await cam();
await p.click('#tabView'); await p.click('#edgeToggle'); await p.waitForTimeout(500);
R.on = await p.evaluate(() => ({ pressed: document.getElementById('edgeToggle').getAttribute('aria-pressed'), label: document.getElementById('edgeToggle').textContent, ctlVisible: !document.getElementById('edgeCtl').hidden }));
assert(R.on.pressed === 'true' && R.on.label === '경계 점검 끄기' && R.on.ctlVisible);
const box = await p.locator('#viewport').boundingBox();
// 박스 외곽(모서리)에 마우스를 올려 반투명 가장자리를 확대한다
const edgePt = await p.evaluate(() => { const V = window.__sabari.viewer; const c = V.faceCorners('lid_top'), r = document.querySelector('#viewport canvas').getBoundingClientRect(); const q = c.slice().sort((a, b) => a[0] - b[0])[0]; return [r.left + q[0], r.top + q[1]]; });
await p.mouse.move(edgePt[0], edgePt[1]); await p.waitForTimeout(300);
const l4 = await loupeInfo(); R.loupe4 = l4; assert(!l4.hidden && l4.label === '4배', '확대경 4배');
await p.screenshot({ path: path.join(OUT, 'edge_loupe_4x.png') });
await p.check('input[name=edgezoom][value="8"]'); await p.waitForTimeout(150);
await p.mouse.move(edgePt[0], edgePt[1]); await p.waitForTimeout(250); // 패널의 라디오를 누르면 마우스가 3D 화면을 벗어나므로 다시 올린다
const l8 = await loupeInfo(); R.loupe8 = l8; assert(l8.label === '8배' && l8.hash !== l4.hash, '확대경 8배는 4배와 다른 영역을 보여 준다 ' + JSON.stringify({ l4, l8, edgePt }));
await p.screenshot({ path: path.join(OUT, 'edge_loupe_8x.png') });
await p.mouse.move(box.x + 10, box.y + 10); await p.mouse.move(box.x + box.width / 2, box.y + 10); R.loupe_off_box = (await loupeInfo()).hidden === false; // 3D 화면 위이므로 보임
await p.click('#edgeAlpha'); await p.waitForTimeout(300);
await p.mouse.move(edgePt[0], edgePt[1]); await p.waitForTimeout(250);
R.alpha = { mask: await maskInfo(), loupe: await loupeInfo() };
assert(!R.alpha.mask.hidden && R.alpha.mask.corner === 0 && R.alpha.mask.center === 255 && R.alpha.mask.gray > 100, '알파 마스크: 바깥 검정, 박스 흰색, 가장자리 회색: ' + JSON.stringify(R.alpha.mask));
assert(R.alpha.loupe.gray, '알파 모드의 확대경은 흑백');
await p.screenshot({ path: path.join(OUT, 'edge_alpha_mask.png') });

// ---- 3. 점검 중에도 회전·확대 유지 -----------------------------------------------------------------------------------------------------------------
const maskBefore = await maskInfo();
await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6); await p.mouse.down(); await p.mouse.move(box.x + box.width * 0.5 + 90, box.y + box.height * 0.6 + 40, { steps: 8 }); await p.mouse.up();
const afterRot = await cam(); assert(afterRot.q.some((x, i) => Math.abs(x - camBefore.q[i]) > 1e-3), '점검 중 드래그 회전');
await p.mouse.wheel(0, -300); await p.waitForTimeout(700);
const afterZoom = await cam(); assert(Math.abs(afterZoom.dist - afterRot.dist) > 1e-4, '점검 중 휠 확대');
await p.waitForTimeout(600); const maskAfter = await maskInfo();
R.refresh = { white: [maskBefore.white, maskAfter.white], changed: maskBefore.white !== maskAfter.white }; assert(R.refresh.changed, '화면이 바뀌면 알파 마스크도 갱신');

// ---- 4. PNG·GLB·.sabari에 영향 없음 ------------------------------------------------------------------------------------------------------------------
await p.evaluate(() => window.__sabari.viewer.setView('iso', true)); await p.waitForTimeout(500);
const pngOn = await dl('#btnPng', 'png_on_white.png', '#tabExport', () => p.selectOption('#bgSel', 'white'));
const pngOnT = await dl('#btnPng', 'png_on_transparent.png', '#tabExport', () => p.selectOption('#bgSel', 'transparent'));
const glbOn = await dl('#btnGlb', 'edge_on.glb', '#tabExport');
R.outputs_unchanged = { pngWhite: pngOff.equals(pngOn), pngTransparent: pngOffT.equals(pngOnT), glb: glbOff.equals(glbOn) };
assert(R.outputs_unchanged.pngWhite && R.outputs_unchanged.pngTransparent && R.outputs_unchanged.glb, '경계 점검은 PNG·GLB에 영향 없음');
const proj = await dl('#btnProjSave', 'edge.sabari', '#tabExport'); const zip = await JSZip.loadAsync(proj); const pj = await zip.file('project.json').async('string');
R.sabari_has_edge = /edge|경계 점검/i.test(pj); R.localStorage_edge = await p.evaluate(() => Object.keys(localStorage).filter((k) => /edge/i.test(k))); assert(!R.sabari_has_edge && R.localStorage_edge.length === 0, '.sabari·localStorage에 저장하지 않음');

// ---- 5. 끄기: 상태 복원, 기본 꺼짐 유지(새로고침), 카메라 불변 -----------------------------------------------------------------------------------
await p.click('#tabView'); const camPre = await cam(); await p.click('#edgeToggle'); await p.waitForTimeout(200);
R.off = await p.evaluate(() => ({ loupeHidden: document.getElementById('edgeLoupe').hidden, maskHidden: document.getElementById('edgeMask').hidden, pressed: document.getElementById('edgeToggle').getAttribute('aria-pressed') })); assert(R.off.loupeHidden && R.off.maskHidden && R.off.pressed === 'false');
R.camera_unchanged_by_toggle = same(camPre, await cam()); assert(R.camera_unchanged_by_toggle);
await p.click('#edgeToggle'); await p.waitForTimeout(200); await p.click('#edgeToggle'); assert(same(camPre, await cam()), '켜고 꺼도 회전·확대 불변');
await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
R.after_reload = await p.evaluate(() => document.getElementById('edgeToggle').getAttribute('aria-pressed')); assert.equal(R.after_reload, 'false', '새로고침 후에도 기본 꺼짐');

// ---- 6. 외부 GLB에서도 사용 가능 ----------------------------------------------------------------------------------------------------------------------
await p.setInputFiles('#fileGlb', path.join(ROOT, 'e2e', 'fixtures', 'legacy_5face.glb')); await p.waitForFunction(() => document.getElementById('glbInfo').textContent.includes('메시')); await p.waitForTimeout(400);
await p.click('#tabView'); await p.evaluate(() => { document.getElementById('dEdge').open = true; }); await p.click('#edgeToggle'); await p.waitForTimeout(500);
const b2 = await p.locator('#viewport').boundingBox(); await p.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2); await p.waitForTimeout(250);
R.external_loupe = await loupeInfo(); assert(!R.external_loupe.hidden, '외부 GLB에서도 확대경');
await p.click('#edgeToggle');

// ---- 7. 컨트롤 수·문구 ---------------------------------------------------------------------------------------------------------------------------------
R.controls = await p.evaluate(() => ({ count: document.querySelectorAll('#dEdge button, #dEdge input').length, hint: document.querySelector('#dEdge .hint').textContent.includes('PNG·GLB에는 들어가지 않습니다') }));
assert(R.controls.count === 4 && R.controls.hint);
R.errors = errors; assert.deepEqual(errors, []);
fs.writeFileSync(path.join(OUT, 'edge_inspect_task14.json'), JSON.stringify(R, null, 1));
console.log('ok edge_inspect_task14');
await browser.close();

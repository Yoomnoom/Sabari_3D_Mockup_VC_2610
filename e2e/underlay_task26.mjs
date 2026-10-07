// 작업 26 검증(합성 이미지만): 면 바탕 이미지(아래 레이어) 합성·UI·저장.
// 실행(B 단계): SABARI_URL=http://127.0.0.1:8766/ STAGE_OUT=verification/underlay26 node e2e/underlay_task26.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/underlay26'); fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
const checks = {}, R = {};
const ok = (k, v, d) => { checks[k] = !!v; if (d !== undefined) R[k] = d; };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const newPage = async () => { const p = await (await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true })).newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(String(e))); await p.goto(URL); await p.waitForFunction(() => window.__sabari); return p; };
const png = (p, kind) => p.evaluate(async (kind) => {
  const W = 400, H = 400, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  if (kind === 'design') { g.fillStyle = 'rgb(200,30,30)'; g.fillRect(0, 0, W, H); g.clearRect(100, 100, 200, 200); g.fillStyle = 'rgba(30,30,200,0.5)'; g.fillRect(0, 0, 40, H); } // 구멍(알파 0)·반투명 띠
  else { const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgb(10,200,10)'); gr.addColorStop(1, 'rgb(250,250,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  const bl = await new Promise((r) => cv.toBlob(r, 'image/png')); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (const c of u) s += String.fromCharCode(c); return btoa(s);
}, kind);
const px = (p, id, fx, fy) => p.evaluate(([id, fx, fy]) => { const c = window.__sabari.faces[id].canvas, g = c.getContext('2d'); return [...g.getImageData(Math.round(fx * (c.width - 1)), Math.round(fy * (c.height - 1)), 1, 1).data]; }, [id, fx, fy]);
const p = await newPage();
await p.evaluate(() => window.__sabari.setCurrent('lid_top'));
await p.setInputFiles('#filePick', { name: 'design.png', mimeType: 'image/png', buffer: Buffer.from(await png(p, 'design'), 'base64') });
await p.waitForFunction(() => window.__sabari.faces.lid_top.img);
await p.check('input[name=fit][value=cover]'); await p.waitForTimeout(200);
await p.check('input[name=fit][value=contain]'); await p.waitForTimeout(150); await p.check('input[name=fit][value=cover]'); await p.waitForTimeout(250); // 첫 굽기는 이후 굽기와 한 번 다를 수 있어(변경 전 빌드도 같음, B 단계 확인) 한 번 더 굽고 기준을 잡는다
const before = await px(p, 'lid_top', 0.5, 0.5);
ok('1_no_underlay_hole_is_face_bg', before[3] === 255 && before[0] > 240, before);
const beforeAll = await p.evaluate(() => Object.fromEntries(Object.entries(window.__sabari.faces).map(([k, f]) => { const d = f.canvas.getContext('2d').getImageData(0, 0, f.canvas.width, f.canvas.height).data; const smp = []; for (let i = 0; i < d.length; i += 1013) smp.push(d[i]); return [k, smp]; })));
// 바탕 추가
await p.setInputFiles('#fileUnder', { name: 'under.png', mimeType: 'image/png', buffer: Buffer.from(await png(p, 'under'), 'base64') });
await p.waitForFunction(() => window.__sabari.faces.lid_top.under); await p.waitForTimeout(300);
const hole = await px(p, 'lid_top', 0.5, 0.5);
ok('2_hole_shows_underlay', hole[1] > 150 && hole[0] < 200 && hole[2] < 100, hole);
const solid = await px(p, 'lid_top', 0.9, 0.9);
ok('2_opaque_design_unchanged', Math.abs(solid[0] - 200) <= 1 && Math.abs(solid[1] - 30) <= 1, solid);
const band = await px(p, 'lid_top', 0.05, 0.9);
ok('2_semitransparent_blend', band[2] > 100 && band[0] < 140, band);
ok('2_face_label', /이미지 있음 · 바탕/.test(await p.textContent('#faceList button[data-face=lid_top]')));
// 보이기 끔 → 예전과 같음
await p.click('.layer-eye'); await p.waitForTimeout(200);
const hidden = await px(p, 'lid_top', 0.5, 0.5);
ok('3_hidden_equals_face_bg', hidden.join() === before.join(), hidden);
await p.click('.layer-eye');
// 선택 레이어 이동: 바탕 선택 후 X 위치
await p.click('#layerList li[data-layer]:not([data-layer=top]) .layer-pick'); await p.fill('#xN', '30'); await p.dispatchEvent('#xN', 'change'); await p.waitForTimeout(200);
ok('4_under_state_moved', await p.evaluate(() => Math.abs(window.__sabari.faces.lid_top.under.state.offsetX - 0.3) < 1e-6 && window.__sabari.faces.lid_top.state.offsetX === 0));
// 타일·불투명도
await p.check('input[name=fit][value=tile]'); await p.fill('#underOpN', '50'); await p.dispatchEvent('#underOpN', 'change'); await p.waitForTimeout(200);
ok('5_tile_opacity_state', await p.evaluate(() => { const u = window.__sabari.faces.lid_top.under.state; return u.fit === 'tile' && Math.abs(u.opacity - 0.5) < 1e-6; }));
// 5면 적용 + 실행 취소 한 번
await p.click('#btnUnderAll'); await p.waitForTimeout(300);
ok('6_all_lid_faces_have_under', await p.evaluate(() => ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right'].every((i) => !!window.__sabari.faces[i].under)));
await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
ok('6_undo_one_step', await p.evaluate(() => ['lid_front', 'lid_back', 'lid_left', 'lid_right'].every((i) => !window.__sabari.faces[i].under) && !!window.__sabari.faces.lid_top.under));
// 삭제 → 변경 전과 픽셀 동일
await p.click('#btnUnderDel'); await p.waitForTimeout(300);
await p.check('input[name=fit][value=contain]'); await p.waitForTimeout(150); await p.check('input[name=fit][value=cover]'); await p.waitForTimeout(250); // 같은 상태를 한 번 더 굽는다(기준과 같은 조건: 위 주석 참조)
const afterAll = await p.evaluate(() => Object.fromEntries(Object.entries(window.__sabari.faces).map(([k, f]) => { const d = f.canvas.getContext('2d').getImageData(0, 0, f.canvas.width, f.canvas.height).data; const smp = []; for (let i = 0; i < d.length; i += 1013) smp.push(d[i]); return [k, smp]; })));
ok('7_delete_restores_pixels', Object.keys(beforeAll).every((k) => beforeAll[k].length === afterAll[k].length && beforeAll[k].every((v, i) => Math.abs(v - afterAll[k][i]) <= 1))); // 표본 ±1(소프트웨어 렌더러의 재굽기 흔들림 허용, 변경 전 빌드도 같음)
await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
ok('7_undo_delete', await p.evaluate(() => !!window.__sabari.faces.lid_top.under));
// 저장→열기
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btnProjSave')]);
const proj = path.join(OUT, 'underlay.sabari'); await dl.saveAs(proj);
const p2 = await newPage(); await p2.setInputFiles('#fileProj', proj); await p2.waitForFunction(() => window.__sabari.faces.lid_top.under, null, { timeout: 15000 });
ok('8_open_restores', await p2.evaluate(() => { const u = window.__sabari.faces.lid_top.under.state; return u.fit === 'tile' && Math.abs(u.opacity - 0.5) < 1e-6; }));
ok('no_page_errors', p.errors.length === 0 && p2.errors.length === 0, [p.errors, p2.errors]);
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ checks, R }, null, 2));
console.log(JSON.stringify(checks, null, 1)); await b.close(); process.exit(Object.values(checks).every(Boolean) ? 0 : 1);

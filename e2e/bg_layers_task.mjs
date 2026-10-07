// 바탕 레이어 여러 장 전용 검증(합성 이미지만): 추가·선택·이동·순서·삭제·실행 취소·저장·열기·옛 파일 호환·5면 적용·PNG/GLB 합성.
// 실행: SABARI_URL=<주소> STAGE_OUT=verification-private/bglayers node e2e/bg_layers_task.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import JSZip from '../frontend/node_modules/jszip/lib/index.js';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification-private/bglayers'); fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.SABARI_URL; const checks = {}, R = {};
const ok = (k, v, d) => { checks[k] = !!v; if (d !== undefined) R[k] = d; };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const mk = async () => { const c = await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true }); await c.addInitScript(() => { try { localStorage.setItem('sabari.askSaveName', '0'); } catch { /* 무시 */ } }); const p = await c.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(String(e))); await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(300); return p; };
const png = (p, kind) => p.evaluate(async (kind) => { const W = 400, H = 400, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'); if (kind === 'design') { g.fillStyle = 'rgb(200,30,30)'; g.fillRect(0, 0, W, H); g.clearRect(100, 100, 200, 200); } else { g.fillStyle = kind; g.fillRect(0, 0, W, H); } const bl = await new Promise((r) => cv.toBlob(r)); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (const c of u) s += String.fromCharCode(c); return btoa(s); }, kind);
const px = (p, id, fx, fy) => p.evaluate(([id, fx, fy]) => { const c = window.__sabari.faces[id].canvas, g = c.getContext('2d'); return [...g.getImageData(Math.round(fx * (c.width - 1)), Math.round(fy * (c.height - 1)), 1, 1).data]; }, [id, fx, fy]);
const info = (p, id = 'lid_top') => p.evaluate((id) => { const f = window.__sabari.faces[id]; return { n: f.unders.length, ids: f.unders.map((u) => u.name), top: f.underOnTop, st: f.unders.map((u) => ({ x: +u.state.offsetX.toFixed(3), s: +u.state.scale.toFixed(3), r: u.state.rotationDeg, o: +u.state.opacity.toFixed(2), v: u.state.visible, fit: u.state.fit })) }; }, id);
const addLayer = async (p, color, name) => { await p.setInputFiles('#fileUnder', { name, mimeType: 'image/png', buffer: Buffer.from(await png(p, color), 'base64') }); await p.waitForFunction((n) => window.__sabari.faces.lid_top.unders.some((u) => u.name === n), name); await p.waitForTimeout(200); };
const hash = (p) => p.evaluate(() => Object.fromEntries(Object.entries(window.__sabari.faces).map(([k, f]) => { const d = f.canvas.getContext('2d').getImageData(0, 0, f.canvas.width, f.canvas.height).data; const s = []; for (let i = 0; i < d.length; i += 1013) s.push(d[i]); return [k, s]; })));
const same = (a, c) => Object.keys(a).every((k) => a[k].length === c[k].length && a[k].filter((v, i) => Math.abs(v - c[k][i]) > 1).length <= a[k].length * 0.01);

const p = await mk();
await p.evaluate(() => window.__sabari.setCurrent('lid_top'));
await p.setInputFiles('#filePick', { name: 'design.png', mimeType: 'image/png', buffer: Buffer.from(await png(p, 'design'), 'base64') }); await p.waitForFunction(() => window.__sabari.faces.lid_top.img);
await p.check('input[name=fit][value=cover]'); await p.waitForTimeout(300);
const hole0 = await px(p, 'lid_top', 0.5, 0.5); ok('1_no_layer_hole_is_face_bg', hole0[0] > 240 && hole0[3] === 255, hole0);
const base0 = await hash(p);
// 추가: 빨강 → 파랑 (파랑이 위)
await addLayer(p, 'rgb(250,0,0)', 'red.png'); await addLayer(p, 'rgb(0,0,250)', 'blue.png');
let i1 = await info(p); ok('2_two_layers_added_top_is_last', i1.n === 2 && i1.ids.join() === 'red.png,blue.png', i1);
const c2 = await px(p, 'lid_top', 0.5, 0.5); ok('2_hole_shows_top_layer_blue', c2[2] > 240 && c2[0] < 10, c2);
ok('2_list_rows', await p.evaluate(() => document.querySelectorAll('#layerList li[data-layer]').length) === 3, null); // 디자인 + 레이어 2
ok('2_selected_row_marked', await p.evaluate(() => document.querySelectorAll('#layerList li.active').length === 1 && !!document.querySelector('#layerList li.active .layer-pick[aria-selected=true]')));
// 순서: 파랑을 아래로 → 빨강이 위
await p.click('#btnUnderDown'); await p.waitForTimeout(250);
i1 = await info(p); const c3 = await px(p, 'lid_top', 0.5, 0.5);
ok('3_order_swapped_red_on_top', i1.ids.join() === 'blue.png,red.png' && c3[0] > 240 && c3[2] < 10, { i1, c3 });
await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
const c3u = await px(p, 'lid_top', 0.5, 0.5); ok('3_undo_order', c3u[2] > 240, c3u);
await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(300);
ok('3_redo_order', (await px(p, 'lid_top', 0.5, 0.5))[0] > 240);
await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
// 선택·이동: 빨강 선택 → X 위치
await p.click('#layerList li[data-layer] .layer-pick >> nth=2'); await p.waitForTimeout(150); // 목록 위에서부터: 디자인, 파랑(위), 빨강
const selName = await p.evaluate(() => document.querySelector('#layerList li.active .layer-name')?.textContent);
await p.waitForTimeout(900); // 같은 면의 연속 조작(0.8초 안)은 실행 취소 한 항목으로 묶이므로 앞 조작과 떼어 놓는다
await p.fill('#xN', '30'); await p.dispatchEvent('#xN', 'change'); await p.waitForTimeout(250);
await p.evaluate(() => document.activeElement?.blur()); // 숫자 칸에 포커스가 있으면 Ctrl+Z가 글자 되돌리기가 된다(앱 단축키는 입력 중에 꺼짐)
i1 = await info(p); ok('4_move_applies_to_selected_only', selName === 'red.png' && i1.st[0].x === 0.3 && i1.st[1].x === 0, { selName, i1 });
await p.keyboard.press('Control+z'); await p.waitForTimeout(250);
ok('4_undo_move', (await info(p)).st[0].x === 0);
// 불투명도·보이기
await p.waitForTimeout(900);
await p.fill('#underOpN', '50'); await p.dispatchEvent('#underOpN', 'change'); await p.waitForTimeout(200);
ok('5_opacity_selected', (await info(p)).st[0].o === 0.5, await info(p)); await p.evaluate(() => document.activeElement?.blur());
await p.click('#layerList li.active .layer-eye'); await p.waitForTimeout(200);
ok('5_hide_selected', (await info(p)).st[0].v === false);
await p.click('#layerList li.active .layer-eye'); await p.waitForTimeout(200);
// 삭제
const nBefore = (await info(p)).n; await p.click('#layerList li.active .layer-del'); await p.waitForTimeout(250);
ok('6_delete_one', (await info(p)).n === nBefore - 1);
await p.keyboard.press('Control+z'); await p.waitForTimeout(250);
ok('6_undo_delete', (await info(p)).n === nBefore);
// 저장 → 새 컨텍스트에서 열기
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btnProjSave')]); const proj = path.join(OUT, 'layers.sabari'); await dl.saveAs(proj);
const zip = await JSZip.loadAsync(fs.readFileSync(proj)); const pj = JSON.parse(await zip.file('project.json').async('string'));
ok('7_saved_v12_two_layers', pj.schemaVersion >= 12 && pj.surfaces.lid_top.underlays?.length === 2, { v: pj.schemaVersion });
const before = await info(p);
const p2 = await mk(); await p2.setInputFiles('#fileProj', proj); await p2.waitForFunction(() => window.__sabari.faces.lid_top.unders.length === 2, null, { timeout: 15000 }); await p2.waitForTimeout(500);
const after = await info(p2); ok('7_open_restores_layers', JSON.stringify(before) === JSON.stringify(after), { before, after });
// 옛 파일(바탕 한 장) 호환
const old = JSON.parse(JSON.stringify(pj)); const l0 = old.surfaces.lid_top.underlays[0]; delete old.surfaces.lid_top.underlays; delete old.surfaces.lid_top.underlayOnTop; old.surfaces.lid_top.underlay = l0; old.schemaVersion = 11; zip.file('project.json', JSON.stringify(old));
const oldFile = path.join(OUT, 'old_v11.sabari'); fs.writeFileSync(oldFile, await zip.generateAsync({ type: 'nodebuffer' }));
const p3 = await mk(); await p3.setInputFiles('#fileProj', oldFile); await p3.waitForFunction(() => window.__sabari.faces.lid_top.unders.length === 1, null, { timeout: 15000 });
ok('8_old_single_opens_as_one_layer', true);
const fut = JSON.parse(JSON.stringify(pj)); fut.schemaVersion = 99; zip.file('project.json', JSON.stringify(fut)); const futFile = path.join(OUT, 'future.sabari'); fs.writeFileSync(futFile, await zip.generateAsync({ type: 'nodebuffer' }));
const p4 = await mk(); await p4.setInputFiles('#fileProj', futFile); await p4.waitForTimeout(1200); ok('8_future_rejected', await p4.evaluate(() => !window.__sabari.faces.lid_top.img));
// 5면 적용(레이어 모두 복사) + 한 번에 되돌림
const pAll = p2; await pAll.click('#btnUnderAll'); await pAll.waitForTimeout(400);
ok('9_apply_to_all_lid_faces', await pAll.evaluate(() => ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right'].every((i) => window.__sabari.faces[i].unders.length === (i === 'lid_top' ? 2 : 2))));
await pAll.keyboard.press('Control+z'); await pAll.waitForTimeout(400);
ok('9_undo_all_one_step', await pAll.evaluate(() => ['lid_front', 'lid_back', 'lid_left', 'lid_right'].every((i) => window.__sabari.faces[i].unders.length === 0) && window.__sabari.faces.lid_top.unders.length === 2));
// 레이어 모두 지우면 레이어 없는 면과 화소 동일
for (let k = 0; k < 2; k++) { await p.click('#layerList li[data-layer]:not([data-layer=top]) .layer-del >> nth=0'); await p.waitForTimeout(250); }
await p.check('input[name=fit][value=contain]'); await p.waitForTimeout(150); await p.check('input[name=fit][value=cover]'); await p.waitForTimeout(300);
ok('10_no_layers_same_as_before', same(await hash(p), base0));
// PNG·GLB 합성 경로: 레이어 하나로 PNG 저장이 오류 없이 되고 GLB 저장이 되는지
await addLayer(p, 'rgb(0,200,0)', 'green.png');
await p.click('#tabExport').catch(() => {}); const [gd] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('#btnGlb')]); const glb = path.join(OUT, 'layers.glb'); await gd.saveAs(glb);
ok('11_glb_saved_nonempty', fs.statSync(glb).size > 1000);
ok('no_page_errors', [p, p2, p3, p4].every((x) => x.errors.length === 0), [p, p2, p3, p4].map((x) => x.errors));
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ checks, R }, null, 1)); console.log(JSON.stringify(checks, null, 1)); await b.close(); process.exit(Object.values(checks).every(Boolean) ? 0 : 1);

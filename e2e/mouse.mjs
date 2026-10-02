// 마우스 조작 검증: 선택선 해제, 미리보기 드래그 이동, 3D Shift+드래그 이동
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), V = path.join(ROOT, 'verification');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8765/';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1360, height: 860 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(URL); await p.waitForFunction(() => window.__sabari);
const R = {};
const hl = () => p.evaluate(() => { const v = window.__sabari.viewer; return !!v.highlight && v.highlight.visible; });
const st = () => p.evaluate(() => { const s = window.__sabari.faces.lid_top.state; return [s.offsetX, s.offsetY]; });
await p.setInputFiles('#filePick', path.join(ROOT, 'assets/samples/sample_lid_top.png'));
await p.waitForFunction(() => window.__sabari.faces.lid_top.img);
await p.click('[data-view=top]'); await p.waitForTimeout(300);

// 1) 선택선: 처음 보임 → 빈 배경 클릭 → 사라짐 → 면 클릭 → 다시 보임
R.hl_initial = await hl();
await p.mouse.click(350, 30);                       // 3D 영역의 빈 배경
R.hl_after_background_click = await hl();
await p.screenshot({ path: path.join(V, '12_highlight_off.png') });
await p.mouse.click(840, 430);                      // 윗면
R.hl_after_face_click = await hl();
await p.mouse.click(1340, 840);                     // 다시 배경
R.hl_off_again = await hl();
await p.click('#faceList button[data-face=lid_top]'); // 면 버튼으로도 다시 표시
R.hl_after_list_click = await hl();
// 열린 상태에서 몸통(면이 아님)을 눌러도 해제
await p.click('#btnOpen'); await p.click('[data-view=iso]'); await p.waitForTimeout(300);
const baseHit = await p.evaluate(() => { const v = window.__sabari.viewer; const THREE_V = v.camera.position.constructor; const q = new THREE_V(0, 0.01, 0.054); q.project(v.camera); const r = v.renderer.domElement.getBoundingClientRect(); return [r.left + (q.x * 0.5 + 0.5) * r.width, r.top + (-q.y * 0.5 + 0.5) * r.height]; });
await p.mouse.click(...baseHit);
R.hl_after_base_click = await hl();
await p.click('#btnClose');

// 2) 미리보기 드래그
await p.click('#faceList button[data-face=lid_top]');
await p.click('[data-view=top]'); await p.waitForTimeout(200);
await p.locator('#facePreview').scrollIntoViewIfNeeded();
const box = await p.locator('#facePreview').boundingBox();
R.offset_before = await st();
await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 + box.width * 0.1, box.y + box.height / 2 - box.height * 0.2, { steps: 5 }); await p.mouse.up();
R.offset_after_preview_drag = await st();   // 기대: x ≈ +0.10, y ≈ -0.20
R.slider_x_after = await p.inputValue('#xN'); R.slider_y_after = await p.inputValue('#yN');

// 3) 3D Shift+드래그 (윗면 정면 뷰에서 커서가 움직인 만큼 이미지가 따라가야 함)
await p.locator('#btnReset').click(); await p.waitForTimeout(100);
const camBefore = await p.evaluate(() => window.__sabari.viewer.camera.position.toArray());
await p.keyboard.down('Shift');
await p.mouse.move(800, 430); await p.mouse.down(); await p.mouse.move(900, 400, { steps: 8 }); await p.mouse.up();
await p.keyboard.up('Shift');
R.offset_after_3d_shift_drag = await st();
R.camera_unchanged_during_shift_drag = JSON.stringify(camBefore) === JSON.stringify(await p.evaluate(() => window.__sabari.viewer.camera.position.toArray()));
await p.screenshot({ path: path.join(V, '12_shift_drag.png') });
// 일반 드래그는 여전히 회전
await p.mouse.move(800, 430); await p.mouse.down(); await p.mouse.move(860, 460, { steps: 5 }); await p.mouse.up();
R.normal_drag_rotates = JSON.stringify(camBefore) !== JSON.stringify(await p.evaluate(() => window.__sabari.viewer.camera.position.toArray()));
R.errors = errs;
console.log(JSON.stringify(R, null, 1)); await b.close();

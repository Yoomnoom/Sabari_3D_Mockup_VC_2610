// 이미지 이동 모드: 버튼 → Shift 없이 3D 드래그로 이동, 휠로 확대/축소, 끄면 회전
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), V = path.join(ROOT, 'verification');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8765/';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1360, height: 860 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(URL); await p.waitForFunction(() => window.__sabari);
const R = {};
const st = (id = 'lid_top') => p.evaluate((id) => { const s = window.__sabari.faces[id].state; return { x: +s.offsetX.toFixed(3), y: +s.offsetY.toFixed(3), s: +s.scale.toFixed(3) }; }, id);
const pose = () => p.evaluate(() => window.__sabari.viewer.boxQuat.toArray().map((v) => +v.toFixed(6)).join());
const cam = () => p.evaluate(() => window.__sabari.viewer.camera.position.toArray().map((v) => +v.toFixed(5)).join());
await p.setInputFiles('#filePick', path.join(ROOT, 'assets/samples/sample_lid_top.png'));
await p.waitForFunction(() => window.__sabari.faces.lid_top.img);
await p.click('[data-view=top]'); await p.waitForTimeout(300);

// 꺼짐: 그냥 드래그 = 회전, 이미지 불변
let c0 = await cam(), q0 = await pose();
await p.mouse.move(800, 430); await p.mouse.down(); await p.mouse.move(850, 450, { steps: 5 }); await p.mouse.up();
R.off_drag = { image: await st(), cameraMoved: c0 !== await cam(), boxRotated: q0 !== await pose() }; // 단계 24: 회전 = 박스 자세
await p.click('[data-view=top]'); await p.waitForTimeout(200);

// 켜짐
await p.locator('#moveMode').scrollIntoViewIfNeeded(); await p.check('#moveMode');
R.checked = await p.isChecked('#moveMode');
c0 = await cam();
await p.mouse.move(800, 430); await p.mouse.down(); await p.mouse.move(900, 400, { steps: 8 }); await p.mouse.up();
R.on_drag = { image: await st(), cameraMoved: c0 !== await cam() };
await p.screenshot({ path: path.join(V, '14_move_mode.png') });
await p.mouse.move(840, 430); await p.mouse.wheel(0, -400); await p.waitForTimeout(150);
R.on_wheel_up = { image: await st(), cameraMoved: c0 !== await cam() };
await p.mouse.wheel(0, 800); await p.waitForTimeout(150);
R.on_wheel_down = await st();
// 선택된 면 밖에서 휠 = 일반 확대/축소(카메라 이동)
const c1 = await cam(); await p.mouse.move(...(await p.bgPoint())); await p.mouse.wheel(0, -300); await p.waitForTimeout(150);
R.wheel_outside_face_zooms_camera = c1 !== await cam();
// 이미지 없는 면에서는 끌면 회전 (이동 모드여도)
await p.click('#faceList button[data-face=lid_front]');
const c2 = await cam(), q2 = await pose(); await p.mouse.move(800, 430); await p.mouse.down(); await p.mouse.move(850, 450, { steps: 5 }); await p.mouse.up();
R.empty_face_drag_rotates = c2 !== await cam() || q2 !== await pose(); // 단계 24: 카메라가 아니라 박스가 돈다
// 끄기
await p.uncheck('#moveMode', { force: true }); R.checked_off = await p.isChecked('#moveMode');
R.errors = errs;
console.log(JSON.stringify(R)); await b.close();

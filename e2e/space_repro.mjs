import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1360, height: 860 } })).newPage();
await p.goto(process.env.SABARI_URL ?? 'http://127.0.0.1:8766/'); await p.waitForFunction(() => window.__sabari);
await p.setInputFiles('#filePick', path.join(ROOT, 'assets/samples/sample_lid_top.png'));
await p.waitForFunction(() => window.__sabari.faces.lid_top.img);
const panning = () => p.evaluate(() => document.getElementById('viewport').classList.contains('panning'));
const R = {};
// A) 숫자 입력칸에 커서가 있고 마우스는 3D 위에 있을 때
await p.locator('#xN').scrollIntoViewIfNeeded(); await p.focus('#xN');
await p.mouse.move(840, 430);
await p.keyboard.down('Space'); R.A_number_field_focused = await panning(); await p.keyboard.up('Space');
// B) 슬라이더/버튼/셀렉트 포커스
await p.focus('#bgSel'); await p.keyboard.down('Space'); R.B_select_focused = await panning(); await p.keyboard.up('Space');
await p.focus('#btnPick'); await p.keyboard.down('Space'); R.C_button_focused = await panning(); await p.keyboard.up('Space');
// D) 3D 화면을 클릭한 직후 (포커스가 body)
await p.mouse.click(840, 430); await p.keyboard.down('Space'); R.D_after_canvas_click = await panning(); await p.keyboard.up('Space');
// E) 한글 IME 상태에서 오는 키 이벤트 (key='Process', code='Space')
await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Process', code: 'Space', keyCode: 229, bubbles: true, cancelable: true })));
R.E_ime_process_key = await panning();
await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Process', code: 'Space', bubbles: true })));
// F) 마우스가 3D 위에 있고 입력칸에 커서가 있을 때: 손 도구 표시(배지)와 실제 이동까지
await p.locator('#xN').scrollIntoViewIfNeeded(); await p.focus('#xN'); await p.fill('#xN', '5');
await p.mouse.move(840, 430);
const t0 = await p.evaluate(() => window.__sabari.viewer.controls.target.toArray().join());
await p.keyboard.down('Space');
R.F_badge_visible = await p.isVisible('#panBadge');
R.F_space_not_typed_into_field = (await p.inputValue('#xN')) === '5';
await p.mouse.down(); await p.mouse.move(920, 470, { steps: 5 }); await p.mouse.up(); await p.keyboard.up('Space');
R.F_pan_moved_target = t0 !== await p.evaluate(() => window.__sabari.viewer.controls.target.toArray().join());
R.F_badge_hidden_after = !(await p.isVisible('#panBadge'));
// G) 마우스가 패널 위에 있으면 입력칸에 Space는 그대로 입력칸 동작(손 도구 아님)
await p.focus('#xN'); await p.mouse.move(150, 300); await p.keyboard.down('Space');
R.G_panel_hover_no_pan = !(await panning()); await p.keyboard.up('Space');
// H) 3/4 시점 R / L
const dir = async () => p.evaluate(() => { const v = window.__sabari.viewer; return v.camera.position.toArray().map((n, i) => +(n - v.controls.target.toArray()[i]).toFixed(2)).join(','); });
const label = () => p.textContent('#btnIso');
await p.mouse.click(1000, 700);
await p.keyboard.press('r'); R.H_R_key = { dir: await dir(), label: await label() };
await p.keyboard.press('l'); R.H_L_key = { dir: await dir(), label: await label() };
await p.click('[data-view=front]'); R.H_label_after_front = await label();
await p.click('#btnIso'); R.H_btn_first_click = { dir: await dir(), label: await label() };      // R 기대
await p.click('#btnIso'); R.H_btn_second_click = { dir: await dir(), label: await label() };     // L 기대
await p.click('#btnIso'); R.H_btn_third_click = { dir: await dir(), label: await label() };      // R 기대
await p.mouse.click(1000, 700); await p.keyboard.press('0'); R.H_key0_toggles = { dir: await dir(), label: await label() }; // L 기대
await p.screenshot({ path: 'verification/18_iso_L.png' });
await p.keyboard.press('r'); await p.screenshot({ path: 'verification/18_iso_R.png' });
console.log(JSON.stringify(R)); await b.close();

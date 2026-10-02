// 단축키 검증: SABARI_URL=http://127.0.0.1:8766/ node e2e/shortcuts.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), V = path.join(ROOT, 'verification');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1360, height: 860 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(process.env.SABARI_URL ?? 'http://127.0.0.1:8766/'); await p.waitForFunction(() => window.__sabari);
const R = {};
const st = (id = 'lid_top') => p.evaluate((id) => { const s = window.__sabari.faces[id].state; return { x: +s.offsetX.toFixed(3), y: +s.offsetY.toFixed(3), s: +s.scale.toFixed(3), r: s.rotationDeg }; }, id);
const cam = () => p.evaluate(() => { const v = window.__sabari.viewer; return { pos: v.camera.position.toArray().map((n) => +n.toFixed(4)), tgt: v.controls.target.toArray().map((n) => +n.toFixed(4)) }; });
const cur = () => p.evaluate(() => window.__sabari.viewer.selected);
await p.setInputFiles('#filePick', path.join(ROOT, 'assets/samples/sample_lid_top.png'));
await p.waitForFunction(() => window.__sabari.faces.lid_top.img);
await p.click('[data-view=top]'); await p.waitForTimeout(250);
const d = (a, b2) => JSON.stringify(a) !== JSON.stringify(b2);

// --- Space + 왼쪽 드래그 = 화면 이동 (타깃이 움직이고, 거리/방향은 유지)
let c0 = await cam();
await p.mouse.move(840, 430); await p.keyboard.down('Space');
R.cursor_class_while_space = await p.evaluate(() => document.getElementById('viewport').classList.contains('panning'));
await p.mouse.down(); await p.mouse.move(940, 480, { steps: 6 }); await p.mouse.up(); await p.keyboard.up('Space');
let c1 = await cam();
R.space_pan = { targetMoved: d(c0.tgt, c1.tgt), offsetSameAsTarget: JSON.stringify(c1.pos.map((v, i) => +(v - c0.pos[i]).toFixed(4))) === JSON.stringify(c1.tgt.map((v, i) => +(v - c0.tgt[i]).toFixed(4))) };
R.cursor_class_after_space = await p.evaluate(() => document.getElementById('viewport').classList.contains('panning'));
// Space 뗀 뒤 왼쪽 드래그 = 회전(타깃 유지). 윗면 시점은 수평 회전해도 위치가 거의 같으므로 3/4 시점에서 확인
await p.click('[data-view=iso]'); await p.waitForTimeout(150); c1 = await cam();
await p.mouse.move(840, 430); await p.mouse.down(); await p.mouse.move(890, 470, { steps: 5 }); await p.mouse.up();
let c2 = await cam();
R.after_space_drag_rotates = { targetSame: !d(c1.tgt, c2.tgt), cameraMoved: d(c1.pos, c2.pos) };
// 가운데 버튼 드래그 = 이동
await p.click('[data-view=top]'); await p.waitForTimeout(150); c0 = await cam();
await p.mouse.move(840, 430); await p.mouse.down({ button: 'middle' }); await p.mouse.move(900, 460, { steps: 5 }); await p.mouse.up({ button: 'middle' });
R.middle_drag_pans = d(c0.tgt, (await cam()).tgt);
// 포커스된 버튼 위에서 Space: 버튼이 눌리지 않고(회전 180° 유지) 화면 이동 모드로
await p.click('#rot180'); const r180 = (await st()).r;
await p.keyboard.press('Space'); await p.waitForTimeout(100);
R.space_does_not_click_focused_button = { before: r180, after: (await st()).r };
// 이동 모드가 켜져 있어도 Space 드래그는 이미지가 아니라 화면 이동
await p.keyboard.press('m'); R.m_toggles_move_mode = await p.isChecked('#moveMode');
const s0 = await st(); c0 = await cam();
await p.mouse.move(840, 430); await p.keyboard.down('Space'); await p.mouse.down(); await p.mouse.move(900, 460, { steps: 5 }); await p.mouse.up(); await p.keyboard.up('Space');
R.space_in_move_mode = { imageUnchanged: !d(s0, await st()), targetMoved: d(c0.tgt, (await cam()).tgt) };
await p.keyboard.press('m'); R.m_toggles_off = !(await p.isChecked('#moveMode'));

// --- 이미지 방향키 이동 / Shift / +,-
await p.click('#btnReset'); await p.click('#faceList button[data-face=lid_top]'); // 포커스를 버튼에 둔 채 방향키
const base = await st();
await p.keyboard.press('ArrowRight'); R.arrow_right_1pct = await st();
await p.keyboard.press('Shift+ArrowDown'); R.shift_down_5pct = await st();
await p.keyboard.press('+'); R.plus_scale = (await st()).s;
await p.keyboard.press('-'); await p.keyboard.press('-'); R.minus_x2_scale = (await st()).s;

// --- 실행 취소 / 다시 실행
await p.waitForTimeout(900);
R.undo_steps = [];
await p.keyboard.press('Control+z'); R.undo_steps.push(await st());
await p.keyboard.press('Control+z'); R.undo_steps.push(await st());
await p.keyboard.press('Control+y'); R.redo_step = await st();
await p.keyboard.press('Control+Shift+z'); R.redo_step2 = await st();
// 슬라이더 드래그처럼 연속 조작은 한 번으로 묶인다
await p.waitForTimeout(900);
const before = await st();
for (let i = 0; i < 5; i++) await p.keyboard.press('ArrowLeft');
await p.keyboard.press('Control+z'); R.coalesced_undo_returns_before = JSON.stringify(await st()) === JSON.stringify(before);

// --- Delete → Ctrl+Z 복구
await p.keyboard.press('Delete'); R.delete_removed = !(await p.evaluate(() => !!window.__sabari.faces.lid_top.img));
await p.keyboard.press('Control+z'); R.undo_restores_image = await p.evaluate(() => !!window.__sabari.faces.lid_top.img);
R.undo_button_visible = !(await p.isHidden('#btnUndo'));

// --- 면 순환 [ ]
await p.keyboard.press(']'); R.next_face = await cur();
await p.keyboard.press('['); await p.keyboard.press('['); R.prev_face_wraps = await cur();
await p.keyboard.press(']');

// --- 시점 단축키
const dirs = {};
for (const [key, name] of [['1', 'front'], ['Shift+1', 'back'], ['3', 'right'], ['Shift+3', 'left'], ['7', 'top'], ['0', 'iso']]) {
  await p.keyboard.press(key); await p.waitForTimeout(80);
  const c = await cam(); dirs[name] = c.pos.map((v, i) => +(v - c.tgt[i]).toFixed(2)).join(',');
}
R.view_dirs = dirs;
// --- Esc, ?, 입력칸 안에서는 단축키 무시
await p.click('#faceList button[data-face=lid_top]'); await p.keyboard.press('Escape');
R.esc_hides_highlight = !(await p.evaluate(() => window.__sabari.viewer.highlight.visible));
await p.keyboard.press('Shift+Slash'); await p.waitForTimeout(100);
R.help_opens = await p.evaluate(() => document.getElementById('dHelp').open);
R.help_visible = await p.isVisible('table.keys');
await p.locator('#xN').scrollIntoViewIfNeeded(); await p.focus('#xN');
const xs = await st(); await p.keyboard.type('m'); await p.keyboard.press('Space');
R.typing_in_number_field_ignored = !(await p.isChecked('#moveMode')) && !(await p.evaluate(() => document.getElementById('viewport').classList.contains('panning')));
R.errors = errs;
console.log(JSON.stringify(R, null, 1)); await b.close();

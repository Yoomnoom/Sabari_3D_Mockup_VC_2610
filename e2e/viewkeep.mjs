// 시점 변경 시 줌 유지 / 위치 초기화(F) 검증
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), V = path.join(ROOT, 'verification');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1360, height: 860 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(process.env.SABARI_URL ?? 'http://127.0.0.1:8766/'); await p.waitForFunction(() => window.__sabari);
for (const f of ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right']) {
  await p.click(`#faceList button[data-face=${f}]`);
  await p.setInputFiles('#filePick', path.join(ROOT, `assets/samples/sample_${f}.png`));
  await p.waitForFunction((id) => window.__sabari.faces[id].img, f);
}
const R = {};
const cam = () => p.evaluate(() => { const v = window.__sabari.viewer, t = v.controls.target, c = v.camera.position; const d = [c.x - t.x, c.y - t.y, c.z - t.z]; const len = Math.hypot(...d); return { dist: +len.toFixed(5), dir: d.map((x) => +(x / len).toFixed(2)).join(','), tgt: t.toArray().map((x) => +x.toFixed(4)).join(',') }; });
await p.click('[data-view=front]'); const fit0 = await cam(); R.fit_front = fit0;

// 휠로 확대 + Space로 이동한 상태 만들기
await p.mouse.click(1000, 700);
await p.mouse.move(840, 430); await p.mouse.wheel(0, -600); await p.waitForTimeout(150);
await p.mouse.move(840, 430); await p.keyboard.down('Space'); await p.mouse.down(); await p.mouse.move(900, 470, { steps: 5 }); await p.mouse.up(); await p.keyboard.up('Space');
const user = await cam(); R.user_zoomed_panned = user;
R.zoom_changed = user.dist !== fit0.dist; R.pan_changed = user.tgt !== fit0.tgt;
await p.screenshot({ path: path.join(V, '20_zoomed_front.png'), clip: { x: 320, y: 0, width: 1040, height: 860 } });

// 시점 버튼: 방향만 바뀌고 거리 유지, 이동은 박스 중심으로
const checks = {};
for (const v of ['back', 'left', 'right', 'top']) { await p.click(`[data-view=${v}]`); checks[v] = await cam(); }
await p.click('#btnIso'); checks.btnIso_first = await cam(); await p.click('#btnIso'); checks.btnIso_second = await cam();
for (const [k, key] of [['key1', '1'], ['keyShift1', 'Shift+1'], ['keyR', 'r'], ['keyL', 'l'], ['key0', '0']]) { await p.mouse.click(1000, 700); await p.keyboard.press(key); checks[k] = await cam(); }
R.views = Object.fromEntries(Object.entries(checks).map(([k, c]) => [k, { dist: c.dist, dir: c.dir, tgt: c.tgt }]));
R.all_distance_kept = Object.values(checks).every((c) => Math.abs(c.dist - user.dist) < 1e-4);
R.all_pan_reset_to_center = Object.values(checks).every((c) => c.tgt === fit0.tgt);

// 위치 초기화(F 키): 방향 유지, 거리·이동은 처음 상태
const before = await cam();
await p.mouse.click(1000, 700); await p.keyboard.press('f'); const afterF = await cam();
R.F_key = { before, after: afterF, directionKept: before.dir === afterF.dir, distanceIsFit: Math.abs(afterF.dist - fit0.dist) < 1e-4, targetIsCenter: afterF.tgt === fit0.tgt };

// 위치 초기화 버튼 (보기 섹션이 접힌 상태에서도 동작, 접기 상태는 바뀌지 않음)
await p.mouse.move(840, 430); await p.mouse.wheel(0, -500); await p.waitForTimeout(100);
await p.click('#dView > summary', { position: { x: 20, y: 10 } }); // 접기
R.view_collapsed = !(await p.evaluate(() => document.getElementById('dView').open));
const zoomed = await cam();
await p.click('#btnFit'); const afterBtn = await cam();
R.fit_button_while_collapsed = { stillCollapsed: !(await p.evaluate(() => document.getElementById('dView').open)), zoomWas: zoomed.dist, distNow: afterBtn.dist, distanceIsFit: Math.abs(afterBtn.dist - fit0.dist) < 1e-4 };
await p.click('#dView > summary', { position: { x: 20, y: 10 } }); // 다시 펼침
R.view_reopened = await p.evaluate(() => document.getElementById('dView').open);

// 뚜껑 열린 상태에서 시점 변경도 줌 유지
await p.mouse.move(840, 430); await p.mouse.wheel(0, -300); await p.waitForTimeout(100);
const z2 = await cam(); await p.click('#btnOpen'); await p.click('[data-view=back]');
R.open_lid_view_keeps_zoom = Math.abs((await cam()).dist - z2.dist) < 1e-4;

// 탭 전환/GLB 불러오기는 전체 보기로 맞춤
await p.click('#tabView'); const tabFit = await cam(); R.tab_switch_refits = Math.abs(tabFit.dist - fit0.dist) < 0.02;
R.errors = errs;
console.log(JSON.stringify(R, null, 1)); await b.close();

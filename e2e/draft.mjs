// 임시저장 검증: 자동 저장 → 새로고침 → 불러오기 / 수동 저장 / 빈 상태가 덮어쓰지 않는지
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), V = path.join(ROOT, 'verification');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8765/';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 860 } });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
const R = {};
await p.goto(URL); await p.waitForFunction(() => window.__sabari);
R.fresh_info = await p.textContent('#draftInfo'); R.fresh_load_disabled = await p.isDisabled('#btnDraftLoad');
for (const f of ['lid_top', 'lid_left']) {
  await p.click(`#faceList button[data-face=${f}]`);
  await p.setInputFiles('#filePick', path.join(ROOT, `assets/samples/sample_${f}.png`));
  await p.waitForFunction((id) => window.__sabari.faces[id].img, f);
}
await p.click('#rot180'); await p.fill('#xN', '15'); await p.dispatchEvent('#xN', 'change'); // 현재 면 = lid_left
await p.click('#faceList button[data-face=lid_top]'); await p.check('input[name=fit][value=cover]'); await p.click('#flipX'); await p.fill('#scaleN', '130'); await p.dispatchEvent('#scaleN', 'change');
await p.evaluate(() => { const e = document.getElementById('colBase'); e.value = '#2c3e50'; e.dispatchEvent(new Event('input', { bubbles: true })); });
await p.click('#btnOpen');
await p.waitForFunction(() => document.getElementById('draftInfo').textContent.includes('자동 저장됨'), null, { timeout: 8000 });
R.autosave_info = await p.textContent('#draftInfo');
const snap = () => p.evaluate(() => ({ top: { ...window.__sabari.faces.lid_top.state }, left: { ...window.__sabari.faces.lid_left.state }, names: Object.values(window.__sabari.faces).map((f) => f.name), base: document.getElementById('colBase').value, lift: window.__sabari.viewer.getLiftMm() }));
await p.waitForTimeout(2500); // 마지막 변경 이후 자동 저장 대기
const before = await snap();

// 새로고침(같은 브라우저 프로필) → 빈 상태, 임시저장 안내
await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
R.after_reload_msg = await p.textContent('#draftToast'); // 작업 19: 상단 띠(#msgText) 대신 3D 화면 안 알림(#draftToast)
R.after_reload_empty = (await snap()).names.every((n) => n === null);
await p.waitForTimeout(3000); // 빈 상태가 기존 임시저장을 덮어쓰지 않아야 한다
R.after_reload_info_after_3s = await p.textContent('#draftInfo');
await p.click('#btnDraftLoad'); await p.waitForTimeout(1500); R.load_msg = await p.textContent('#msgText'); await p.waitForFunction(() => window.__sabari.faces.lid_left.img, null, { timeout: 5000 }).catch(() => {});
const after = await snap();
R.restored_equal = JSON.stringify(before) === JSON.stringify(after);
R.before = before; R.after = after;
await p.screenshot({ path: path.join(V, '13_draft_restored.png') });

// 수동 저장 + 다른 탭(같은 프로필)에서 불러오기
await p.click('#btnDraftSave'); await p.waitForFunction(() => document.getElementById('msgText').textContent.includes('임시저장했습니다'));
R.manual_msg = await p.textContent('#msgText');
const p2 = await ctx.newPage(); await p2.goto(URL); await p2.waitForFunction(() => window.__sabari);
R.second_tab_info = await p2.textContent('#draftInfo');
R.errors = errs;
console.log(JSON.stringify(R, null, 1)); await b.close();

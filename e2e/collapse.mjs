// 접이식 섹션 · 설정/도움말 검증
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), V = path.join(ROOT, 'verification');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 860 } });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(URL); await p.waitForFunction(() => window.__sabari);
const R = {};
const open = (id) => p.evaluate((id) => document.getElementById(id).open, id);
const ids = ['dFit', 'dRot', 'dPos', 'dColor', 'dBox', 'dView', 'dHelp'];
R.initial_open = Object.fromEntries(await Promise.all(ids.map(async (i) => [i, await open(i)]))); // dHelp만 false 기대

// 이미지가 없는 면에서도 접기·펼치기가 된다 (조절 항목은 흐리게 비활성)
R.no_image_toggle = {};
for (const id of ['dFit', 'dRot', 'dPos']) {
  await p.click(`#${id} > summary`);
  R.no_image_toggle[id] = { open: await open(id) }; // false 기대
}
R.fit_radio_hidden_when_closed = !(await p.isVisible('#dFit input[name=fit]'));
await p.click('#dFit > summary'); R.fit_reopen = await open('dFit');
R.pos_keep_checkbox_clickable_without_image = await (async () => { await p.click('#dPos > summary'); await p.check('#moveMode'); const v = await p.isChecked('#moveMode'); await p.uncheck('#moveMode'); return v; })();

// 색상·박스·보기도 접힘
for (const id of ['dColor', 'dBox', 'dView']) await p.click(`#${id} > summary`);
R.top_sections_closed = [await open('dColor'), await open('dBox'), await open('dView')];
const h = await p.evaluate(() => document.getElementById('panel').scrollHeight);
R.panel_height_all_collapsed = h;
await p.screenshot({ path: path.join(V, '17_collapsed.png') });

// 새로고침해도 상태 유지
await p.reload(); await p.waitForFunction(() => window.__sabari);
R.after_reload = Object.fromEntries(await Promise.all(ids.map(async (i) => [i, await open(i)])));
// 접기·펼치기 초기화
await p.click('#dHelp > summary'); await p.click('#btnUiReset');
R.after_ui_reset = Object.fromEntries(await Promise.all(ids.map(async (i) => [i, await open(i)])));

// ? 키 → 도움말 펼침 + 표 표시
await p.click('#dHelp > summary'); R.help_opened_by_click = await open('dHelp');
await p.click('#dHelp > summary'); R.help_closed_again = !(await open('dHelp'));
await p.mouse.click(1000, 600); await p.keyboard.press('Shift+Slash');
// 작업 17: ? 키는 도움말 대화상자(#helpDlg)를 연다(Esc로 닫힘)
R.question_opens_help = await p.evaluate(() => document.getElementById('helpDlg').open); R.keys_table_visible = await p.isVisible('#helpDlg table.keys'); await p.keyboard.press('Escape'); R.help_closes_with_esc = !(await p.evaluate(() => document.getElementById('helpDlg').open));
await p.screenshot({ path: path.join(V, '17_help_open.png') });

// 단축키 끄기: M이 동작하지 않고 Space 이동은 유지, 다시 켜면 동작
await p.setInputFiles('#filePick', path.join(ROOT, 'assets/samples/sample_lid_top.png'));
await p.waitForFunction(() => window.__sabari.faces[window.__sabari.viewer.selected].img);
if (!(await open('dHelp'))) await p.click('#dHelp > summary'); // 작업 17: ? 키가 더 이상 설정 구역을 펼치지 않으므로 직접 펼친다
await p.uncheck('#optKeys'); await p.mouse.click(1000, 600);
await p.keyboard.press('m'); R.keys_off_m_ignored = !(await p.isChecked('#moveMode'));
await p.keyboard.press('1'); const camOff = await p.evaluate(() => window.__sabari.viewer.camera.position.toArray().join());
await p.keyboard.down('Space'); R.keys_off_space_still_pans = await p.evaluate(() => document.getElementById('viewport').classList.contains('panning')); await p.keyboard.up('Space');
await p.reload(); await p.waitForFunction(() => window.__sabari);
R.keys_option_persisted_off = !(await p.isChecked('#optKeys'));
await p.check('#optKeys'); await p.mouse.click(1000, 600); await p.keyboard.press('m'); R.keys_on_m_works = await p.isChecked('#moveMode');

// 임시저장 삭제 (확인 창 수락)
await p.setInputFiles('#filePick', path.join(ROOT, 'assets/samples/sample_lid_top.png'));
await p.waitForFunction(() => document.getElementById('draftInfo').textContent.includes('자동 저장됨'), null, { timeout: 8000 });
await p.click('#dHelp > summary').catch(() => {}); if (!(await open('dHelp'))) await p.click('#dHelp > summary');
await p.click('#btnDraftClear'); await p.waitForSelector('#msgDlg[open]'); await p.click('#msgDlgOk'); // 작업 17: 앱의 확인 대화상자
await p.waitForFunction(() => document.getElementById('draftInfo').textContent === '임시저장 없음');
R.draft_cleared_load_disabled = await p.isDisabled('#btnDraftLoad');
await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
R.draft_gone_after_reload = (await p.textContent('#draftInfo')) === '임시저장 없음';
R.errors = errs;
console.log(JSON.stringify(R, null, 1)); await b.close();

// 칼선 카드 종류 선택 검증(합성 이미지만): "칼선 이미지 한 장 올리기"가 뚜껑으로만 들어가던 문제.
// 카드의 "뚜껑 / 하단 몸통" 선택이 대화상자·종류별 저장과 같은 값을 쓰는지, 하단 몸통을 고르면 스위치가 켜지는지,
// 새 프로젝트의 "하단 몸통 디자인 사용" 기본값이 켬이고 열어 온 .sabari는 저장된 값을 그대로 쓰는지.
// 실행: SABARI_URL=http://127.0.0.1:8766/ STAGE_OUT=verification/diekindcard node e2e/dieline_kind_card_task.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/diekindcard'); fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
const checks = {}, R = {};
const ok = (k, v, d) => { checks[k] = !!v; if (d !== undefined) R[k] = d; };
const ALL = ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right', 'base_front', 'base_back', 'base_left', 'base_right', 'base_bottom'];
const LID = ALL.slice(0, 5), BASE = ALL.slice(5);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const newPage = async () => { const c = await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true }); await c.addInitScript(() => { try { localStorage.setItem('sabari.askSaveName', '0'); } catch { /* 무시 */ } }); const p = await c.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(String(e))); await p.goto(URL); await p.waitForFunction(() => window.__sabari); return p; };
const png = (p, color, w = 1400, h = 1100) => p.evaluate(async ([color, w, h]) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(40, 40, 120, 120); const bl = await new Promise((r) => cv.toBlob(r, 'image/png')); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (const c of u) s += String.fromCharCode(c); return btoa(s); }, [color, w, h]);
const imgs = (p) => p.evaluate((ALL) => ALL.filter((id) => window.__sabari.faces[id].img), ALL);
const kindOf = (p) => p.evaluate(() => document.getElementById('dieKindBase').checked ? 'base' : document.getElementById('dieKindLid').checked ? 'lid' : null);
const same = (a, c) => JSON.stringify(a) === JSON.stringify(c);
const pickDie = async (p, name, color) => { await p.setInputFiles('#fileDieline', { name, mimeType: 'image/png', buffer: Buffer.from(await png(p, color), 'base64') }); await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(700); };
const applyDie = async (p) => { await p.click('#btnSplitApply'); await p.waitForFunction(() => !document.getElementById('splitDlg').open, null, { timeout: 20000 }); await p.waitForTimeout(600); };
const cancelDie = async (p) => { await p.click('#btnSplitCancel'); await p.waitForFunction(() => !document.getElementById('splitDlg').open); await p.waitForTimeout(200); };
const dlgKind = (p) => p.evaluate(() => document.getElementById('splitKind').value);

// 1: 새 프로젝트 기본값 — 하단 몸통 사용 켬, 처음 선택은 상단, 카드 종류는 뚜껑
{
  const p = await newPage();
  ok('1_new_project_use_base_on', await p.isChecked('#useBase'));
  ok('1_new_project_face_tabs_visible', !(await p.evaluate(() => document.getElementById('faceTabs').hidden)));
  ok('1_new_project_selects_top', (await p.evaluate(() => document.querySelector('#faceList button[aria-pressed=true]')?.dataset.face)) === 'lid_top');
  ok('1_card_default_kind_lid', (await kindOf(p)) === 'lid');
  // 2: 기본 종류는 선택한 면을 따른다
  await p.click('#tab_base'); await p.click('#faceList button[data-face=base_left]');
  ok('2_base_face_selected_kind_base', (await kindOf(p)) === 'base');
  await p.click('#tab_lid'); await p.click('#faceList button[data-face=lid_front]');
  ok('2_lid_face_selected_kind_lid', (await kindOf(p)) === 'lid');
  ok('1_no_errors', p.errors.length === 0, p.errors); await p.context().close();
}
// 3: 뚜껑 종류로 올리면 뚜껑 면에만
{
  const p = await newPage();
  ok('3_lid_kind_selected', (await kindOf(p)) === 'lid');
  await pickDie(p, 'lidA.png', 'rgb(90,160,90)');
  ok('3_dialog_kind_lid', (await dlgKind(p)) === 'lid');
  await applyDie(p);
  ok('3_lid_only', same(await imgs(p), LID), await imgs(p));
  ok('3_no_errors', p.errors.length === 0, p.errors); await p.context().close();
}
// 4: 하단 몸통 종류로 올리면 하단 면에만
{
  const p = await newPage();
  await p.check('#dieKindBase');
  await pickDie(p, 'baseB.png', 'rgb(200,120,40)');
  ok('4_dialog_kind_base', (await dlgKind(p)) === 'base');
  ok('4_kind_note_base', /하단 몸통 5면만/.test(await p.textContent('#splitKindNote')));
  await applyDie(p);
  ok('4_base_only', same(await imgs(p), BASE), await imgs(p));
  ok('4_card_kind_stays_base', (await kindOf(p)) === 'base');
  ok('4_no_errors', p.errors.length === 0, p.errors); await p.context().close();
}
// 5: 끈 상태에서 하단 몸통 종류를 고르면 스위치가 자동으로 켜진다
{
  const p = await newPage();
  await p.uncheck('#useBase'); await p.waitForTimeout(300);
  ok('5_switch_off', !(await p.isChecked('#useBase')) && (await p.evaluate(() => document.getElementById('faceTabs').hidden)));
  await p.check('#dieKindLid'); await p.waitForTimeout(200);
  ok('5_lid_kind_keeps_switch_off', !(await p.isChecked('#useBase')));
  await p.check('#dieKindBase'); await p.waitForTimeout(300);
  ok('5_base_kind_turns_switch_on', await p.isChecked('#useBase'));
  ok('5_face_tabs_visible', !(await p.evaluate(() => document.getElementById('faceTabs').hidden)));
  // 끈 상태에서 바로 하단 몸통 칼선을 올려도 하단 면에만 들어간다
  const q = await newPage(); await q.uncheck('#useBase'); await q.check('#dieKindBase'); await pickDie(q, 'baseB.png', 'rgb(200,120,40)'); await applyDie(q);
  ok('5_off_then_base_kind_upload_base_only', same(await imgs(q), BASE), await imgs(q));
  ok('5_no_errors', [p, q].every((x) => x.errors.length === 0), [p, q].map((x) => x.errors));
  await p.context().close(); await q.context().close();
}
// 6: 종류별 저장이 섞이지 않는다 + 카드와 대화상자의 종류가 항상 같다
{
  const p = await newPage();
  await pickDie(p, 'lidA.png', 'rgb(90,160,90)'); await applyDie(p);
  await p.check('#dieKindBase'); await pickDie(p, 'baseB.png', 'rgb(200,120,40)'); await applyDie(p);
  const info = await p.textContent('#dielineInfo');
  ok('6_info_has_both_names_separately', /뚜껑: lidA\.png/.test(info) && /하단 몸통: baseB\.png/.test(info), info);
  await p.check('#dieKindLid'); await p.click('#btnSplitEdit'); await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(700);
  ok('6_edit_lid_opens_lid', (await dlgKind(p)) === 'lid', await dlgKind(p));
  // 대화상자 안에서 종류를 바꾸면 카드도 따라간다(저장본이 불러와진다)
  await p.selectOption('#splitKind', 'base'); await p.waitForTimeout(900);
  ok('6_dialog_change_syncs_card', (await kindOf(p)) === 'base', await kindOf(p));
  await cancelDie(p);
  await p.check('#dieKindBase'); await p.click('#btnSplitEdit'); await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(700);
  ok('6_edit_base_opens_base', (await dlgKind(p)) === 'base', await dlgKind(p));
  await cancelDie(p);
  ok('6_info_unchanged_after_cancel', (await p.textContent('#dielineInfo')) === info);
  // 뚜껑 저장만 있을 때 하단 몸통 종류로 "분할 영역 조정"을 열면 그 이미지를 하단 몸통으로 연다
  const q = await newPage(); await pickDie(q, 'lidA.png', 'rgb(90,160,90)'); await applyDie(q);
  await q.check('#dieKindBase'); await q.click('#btnSplitEdit'); await q.waitForSelector('#splitDlg[open]'); await q.waitForTimeout(700);
  ok('6_edit_other_kind_opens_selected_kind', (await dlgKind(q)) === 'base', await dlgKind(q));
  await cancelDie(q);
  ok('6_cancel_changes_nothing', same(await imgs(q), LID), await imgs(q));
  ok('6_no_errors', [p, q].every((x) => x.errors.length === 0), [p, q].map((x) => x.errors));
  await p.context().close(); await q.context().close();
}
// 7: 열어 온 .sabari는 저장된 값을 그대로 쓴다(꺼 둔 파일은 꺼진 채, 켠 파일은 켠 채)
{
  const A = await newPage(); await A.uncheck('#useBase'); await A.waitForTimeout(300);
  await A.setInputFiles('#filePick', { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(await png(A, 'rgb(30,30,200)', 300, 300), 'base64') }); await A.waitForTimeout(500);
  await A.click('#tabExport'); const [da] = await Promise.all([A.waitForEvent('download'), A.click('#btnProjSave')]); const fOff = path.join(OUT, 'off.sabari'); await da.saveAs(fOff);
  const Bp = await newPage(); // 새 프로젝트(켬) → 하단 면에 이미지 → 저장
  await Bp.click('#tab_base'); await Bp.click('#faceList button[data-face=base_front]');
  await Bp.setInputFiles('#filePick', { name: 'b.png', mimeType: 'image/png', buffer: Buffer.from(await png(Bp, 'rgb(200,100,30)', 300, 300), 'base64') }); await Bp.waitForTimeout(500);
  await Bp.click('#tabExport'); const [db] = await Promise.all([Bp.waitForEvent('download'), Bp.click('#btnProjSave')]); const fOn = path.join(OUT, 'on.sabari'); await db.saveAs(fOn);
  const C = await newPage();
  ok('7_fresh_page_is_on', await C.isChecked('#useBase'));
  await C.setInputFiles('#fileProj', fOff); await C.waitForFunction(() => window.__sabari.faces.lid_top.img); await C.waitForTimeout(600);
  ok('7_old_file_off_stays_off', !(await C.isChecked('#useBase')) && (await C.evaluate(() => document.getElementById('faceTabs').hidden)));
  const D = await newPage();
  await D.setInputFiles('#fileProj', fOn); await D.waitForFunction(() => window.__sabari.faces.base_front.img); await D.waitForTimeout(600);
  ok('7_file_with_base_stays_on', await D.isChecked('#useBase'));
  // 끈 파일을 만든 뒤 "열기" 다음 새로 고침해도(임시저장 복원 없이) 새 프로젝트는 켬
  ok('7_no_errors', [A, Bp, C, D].every((x) => x.errors.length === 0), [A, Bp, C, D].map((x) => x.errors));
  for (const x of [A, Bp, C, D]) await x.context().close();
}
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ checks, R }, null, 1)); console.log(JSON.stringify(checks, null, 1)); await b.close(); process.exit(Object.values(checks).every(Boolean) ? 0 : 1);

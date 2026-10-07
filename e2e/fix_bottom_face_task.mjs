// 버그 수정 검증(합성 이미지만): "하단 몸통에 올린 이미지가 상단으로 들어간다".
// 하단 면을 고르고 올리면 그 면에만 들어가고 상단은 그대로인지(이미지 올리기·바탕 레이어·칼선 분할·면 가져오기),
// "하단 몸통 사용"을 켠 직후에는 선택이 하단 면으로 옮겨 가는지, 끈 상태에서는 하단 면이 건드려지지 않는지.
// 실행: SABARI_URL=http://127.0.0.1:8766/ STAGE_OUT=verification/fixbottom node e2e/fix_bottom_face_task.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/fixbottom'); fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
const checks = {}, R = {};
const ok = (k, v, d) => { checks[k] = !!v; if (d !== undefined) R[k] = d; };
const ALL = ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right', 'base_front', 'base_back', 'base_left', 'base_right', 'base_bottom'];
const LID = ALL.slice(0, 5), BASE = ALL.slice(5);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const newPage = async () => { const c = await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true }); await c.addInitScript(() => { try { localStorage.setItem('sabari.askSaveName', '0'); } catch { /* 무시 */ } }); const p = await c.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(String(e))); await p.goto(URL); await p.waitForFunction(() => window.__sabari); return p; };
const png = (p, color, w = 300, h = 300) => p.evaluate(async ([color, w, h]) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(20, 20, 60, 60); const bl = await new Promise((r) => cv.toBlob(r, 'image/png')); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (const c of u) s += String.fromCharCode(c); return btoa(s); }, [color, w, h]);
const imgs = (p) => p.evaluate((ALL) => ALL.filter((id) => window.__sabari.faces[id].img), ALL);
const lays = (p) => p.evaluate((ALL) => ALL.filter((id) => window.__sabari.faces[id].unders.length), ALL);
const selected = (p) => p.evaluate(() => document.querySelector('#faceList button[aria-pressed=true]')?.dataset.face ?? null);
const upload = async (p, color = 'rgb(200,30,30)') => { await p.setInputFiles('#filePick', { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from(await png(p, color), 'base64') }); await p.waitForTimeout(600); };
const pickBase = async (p, id) => { await p.click('#tab_base'); await p.click(`#faceList button[data-face=${id}]`); };
const same = (a, c) => JSON.stringify(a) === JSON.stringify(c);

// 1: 이미지 올리기 — 하단 5면 각각
{
  const p = await newPage(); await p.check('#useBase');
  const got = {};
  for (const id of BASE) { const before = await imgs(p); await pickBase(p, id); await upload(p); const after = await imgs(p); got[id] = after.filter((x) => !before.includes(x)); }
  ok('1_upload_goes_to_selected_base_face', BASE.every((id) => same(got[id], [id])), got);
  ok('1_top_and_lid_untouched', (await imgs(p)).every((x) => BASE.includes(x)));
  // 실행 취소는 마지막 면 하나만 되돌린다
  await p.evaluate(() => document.activeElement?.blur()); await p.keyboard.press('Control+z'); await p.waitForTimeout(500);
  ok('1_undo_only_last_face', same(await imgs(p), BASE.slice(0, 4)), await imgs(p));
  ok('1_no_errors', p.errors.length === 0, p.errors); await p.context().close();
}
// 2: 바탕 레이어 — 하단 면마다 디자인 이미지 + 레이어
{
  const p = await newPage(); await p.check('#useBase');
  const got = {};
  for (const id of BASE) {
    await pickBase(p, id); await upload(p); const before = await lays(p);
    await p.setInputFiles('#fileUnder', { name: 'u.png', mimeType: 'image/png', buffer: Buffer.from(await png(p, 'rgb(40,120,220)'), 'base64') }); await p.waitForTimeout(600);
    got[id] = (await lays(p)).filter((x) => !before.includes(x));
  }
  ok('2_layer_goes_to_selected_base_face', BASE.every((id) => same(got[id], [id])), got);
  ok('2_lid_has_no_layers_or_images', (await lays(p)).every((x) => BASE.includes(x)) && (await imgs(p)).every((x) => BASE.includes(x)));
  ok('2_no_errors', p.errors.length === 0, p.errors); await p.context().close();
}
// 3: 칼선 분할 — 종류 "하단 몸통"
{
  const p = await newPage(); await p.check('#useBase');
  await p.setInputFiles('#fileDieline', { name: 'd.png', mimeType: 'image/png', buffer: Buffer.from(await png(p, 'rgb(90,160,90)', 1400, 1100), 'base64') });
  await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(600);
  await p.selectOption('#splitKind', 'base'); await p.waitForTimeout(900);
  await p.click('#btnSplitApply'); await p.waitForFunction(() => !document.getElementById('splitDlg').open, null, { timeout: 20000 }); await p.waitForTimeout(600);
  ok('3_split_base_only_base', same(await imgs(p), BASE), await imgs(p));
  ok('3_split_selects_base_face', BASE.includes(await selected(p)), await selected(p));
  ok('3_no_errors', p.errors.length === 0, p.errors); await p.context().close();
}
// 4: 다른 프로젝트에서 면 가져오기 — 하단 5면만, 상단 이미지는 그대로
{
  const A = await newPage(); await A.setInputFiles('#filePick', { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(await png(A, 'rgb(30,30,200)'), 'base64') }); await A.waitForTimeout(500);
  await A.click('#tabExport'); const [da] = await Promise.all([A.waitForEvent('download'), A.click('#btnProjSave')]); const fa = path.join(OUT, 'A.sabari'); await da.saveAs(fa);
  const Bp = await newPage(); await Bp.check('#useBase');
  for (const id of BASE) { await pickBase(Bp, id); await upload(Bp, 'rgb(200,100,30)'); }
  await Bp.click('#tabExport'); const [db] = await Promise.all([Bp.waitForEvent('download'), Bp.click('#btnProjSave')]); const fb = path.join(OUT, 'B.sabari'); await db.saveAs(fb);
  const p = await newPage(); await p.setInputFiles('#fileProj', fa); await p.waitForFunction(() => window.__sabari.faces.lid_top.img); await p.waitForTimeout(500);
  await p.setInputFiles('#fileImport', fb); await p.waitForSelector('#importDlg[open]'); await p.waitForTimeout(500);
  await p.click('#impQuickBase'); await p.waitForTimeout(150);
  await p.click('#btnImportApply'); await p.waitForFunction(() => !document.getElementById('importDlg').open, null, { timeout: 20000 }); await p.waitForTimeout(600);
  ok('4_import_base_goes_to_base', same(await imgs(p), ['lid_top', ...BASE]), await imgs(p));
  ok('4_no_errors', [A, Bp, p].every((x) => x.errors.length === 0), [A, Bp, p].map((x) => x.errors));
  for (const x of [A, Bp, p]) await x.context().close();
}
// 5: "하단 몸통 사용"을 켠 직후 — 선택이 하단 면으로 옮겨 가고, 바로 올리면 하단 면에 들어간다(상단이 아님)
{
  const p = await newPage(); await p.uncheck('#useBase'); await p.waitForTimeout(300); // v0.10.1부터 새 프로젝트는 켬 → 이 시나리오는 끈 상태에서 시작한다
  ok('5_before_toggle_top_selected', (await selected(p)) === 'lid_top');
  await p.check('#useBase'); await p.waitForTimeout(300);
  ok('5_toggle_on_selects_base_face', (await selected(p)) === 'base_front', await selected(p));
  await upload(p);
  ok('5_upload_after_toggle_goes_to_base', same(await imgs(p), ['base_front']), await imgs(p));
  // 마지막으로 고른 하단 면을 기억한다: 하단 좌 선택 → 끄기(이미지 제거 확인) → 다시 켜기
  await pickBase(p, 'base_left'); await p.uncheck('#useBase'); await p.waitForTimeout(300);
  const dlg = p.locator('dialog[open] button', { hasText: '제거하고 끄기' }); if (await dlg.count()) await dlg.first().click();
  await p.waitForTimeout(500);
  ok('5_off_selects_lid_face', LID.includes(await selected(p)), await selected(p));
  await p.check('#useBase'); await p.waitForTimeout(300);
  ok('5_on_again_remembers_last_base_face', (await selected(p)) === 'base_left', await selected(p));
  ok('5_no_errors', p.errors.length === 0, p.errors); await p.context().close();
}
// 6: 끈 상태 — 하단 탭이 없고, 올리면 상단에만 들어간다(하단 면은 건드리지 않는다)
{
  const p = await newPage(); await p.uncheck('#useBase'); await p.waitForTimeout(300); // 끈 상태 시나리오
  ok('6_off_has_no_base_tab', await p.evaluate(() => document.getElementById('faceTabs').hidden));
  await upload(p);
  ok('6_off_upload_only_top', same(await imgs(p), ['lid_top']), await imgs(p));
  ok('6_no_errors', p.errors.length === 0, p.errors); await p.context().close();
}
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ checks, R }, null, 1)); console.log(JSON.stringify(checks, null, 1)); await b.close(); process.exit(Object.values(checks).every(Boolean) ? 0 : 1);

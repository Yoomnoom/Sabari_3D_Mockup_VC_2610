// 작업 31 검증(합성 .sabari만): 다른 프로젝트에서 면 가져오기.
// 실행(B 단계): SABARI_URL=http://127.0.0.1:8766/ STAGE_OUT=verification/import31 node e2e/import_faces_task31.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/import31'); fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
const checks = {}, R = {};
const ok = (k, v, d) => { checks[k] = !!v; if (d !== undefined) R[k] = d; };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const newPage = async () => { const c = await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true }); await c.addInitScript(() => { try { localStorage.setItem('sabari.askSaveName', '0'); } catch { /* 무시 */ } }); const p = await c.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(String(e))); await p.goto(URL); await p.waitForFunction(() => window.__sabari); return p; };
const png = (p, color) => p.evaluate(async (color) => { const cv = document.createElement('canvas'); cv.width = 300; cv.height = 300; const g = cv.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 300, 300); g.fillStyle = '#fff'; g.fillRect(20, 20, 60, 60); const bl = await new Promise((r) => cv.toBlob(r, 'image/png')); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (const c of u) s += String.fromCharCode(c); return btoa(s); }, color);
const put = async (p, id, color) => { await p.evaluate((id) => window.__sabari.setCurrent(id), id); await p.setInputFiles('#filePick', { name: `${id}.png`, mimeType: 'image/png', buffer: Buffer.from(await png(p, color), 'base64') }); await p.waitForFunction((id) => window.__sabari.faces[id].img, id); };
const save = async (p, name) => { const [d] = await Promise.all([p.waitForEvent('download'), p.click('#btnProjSave')]); const f = path.join(OUT, name); await d.saveAs(f); return f; };
// 화소 표본(바이트 1013칸마다) + 상태. 같은 입력을 다시 구워도 소프트웨어 렌더러에서 화소 한두 개가 ±1 흔들릴 수 있어(변경 전 빌드도 같음) 비교는 ±1 허용으로 한다.
const hashes = (p, ids) => p.evaluate((ids) => Object.fromEntries(ids.map((i) => { const f = window.__sabari.faces[i]; if (!f.img) return [i, null]; const d = f.canvas.getContext('2d').getImageData(0, 0, f.canvas.width, f.canvas.height).data; const smp = []; for (let k = 0; k < d.length; k += 1013) smp.push(d[k]); return [i, { smp, st: JSON.stringify(f.state), n: d.length }]; })), ids);
const same = (a, b) => { const ks = Object.keys(a); return ks.every((k) => { const x = a[k], y = b[k]; if (!x || !y) return x === y; return x.st === y.st && x.n === y.n && x.smp.filter((v, i) => Math.abs(v - y.smp[i]) > 1).length <= x.smp.length * 0.01 /* 가장자리 1px 안티앨리어싱 흔들림 허용(1% 이하) */; }); };
const LID = ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right'], BASE = ['base_bottom', 'base_front', 'base_back', 'base_left', 'base_right'];

// A: 뚜껑 5면, B: 하단 5면(스위치 켬)
const A = await newPage(); for (const [i, id] of LID.entries()) await put(A, id, `hsl(${i * 50} 70% 45%)`);
const fa = await save(A, 'A.sabari');
const B = await newPage(); await B.check('#useBase'); for (const [i, id] of BASE.entries()) await put(B, id, `hsl(${200 + i * 30} 60% 40%)`);
const fb = await save(B, 'B.sabari'); const bBase = await hashes(B, BASE);
// A 프로젝트에 B의 하단 5면만 가져오기
const p = await newPage(); await p.setInputFiles('#fileProj', fa); await p.waitForFunction(() => window.__sabari.faces.lid_top.img);
const lidBefore = await hashes(p, LID);
const shot = async (n) => fs.writeFileSync(path.join(OUT, n), Buffer.from((await p.evaluate(() => window.__sabari.faces.lid_top.canvas.toDataURL('image/png'))).split(',')[1], 'base64'));
await shot('top_before.png');
await p.setInputFiles('#fileImport', fb); await p.waitForSelector('#importDlg[open]'); await p.waitForTimeout(500);
ok('1_current_unchanged_while_dialog_open', same(await hashes(p, LID), lidBefore));
await p.click('#impQuickBase'); await p.waitForTimeout(100);
ok('2_count', /5면 선택/.test(await p.textContent('#importCount')));
await p.click('#btnImportApply'); await p.waitForFunction(() => !document.getElementById('importDlg').open); await p.waitForTimeout(600);
ok('3_lid_unchanged', same(await hashes(p, LID), lidBefore));
ok('3_base_equals_B', same(await hashes(p, BASE), bBase), undefined);
ok('3_base_switch_on', await p.isChecked('#useBase'));
// 실행 취소 한 번
await p.keyboard.press('Control+z'); await p.waitForTimeout(500);
ok('4_undo_restores', (await hashes(p, BASE)).base_bottom === null && same(await hashes(p, LID), lidBefore));
// 취소 시 변화 없음
await p.setInputFiles('#fileImport', fb); await p.waitForSelector('#importDlg[open]'); await p.click('#impQuickAll'); await p.click('#btnImportCancel'); await p.waitForTimeout(300);
ok('5_cancel_no_change', (await hashes(p, BASE)).base_bottom === null);
// 이미 이미지가 있는 면: 확인 질문
await p.setInputFiles('#fileImport', fa); await p.waitForSelector('#importDlg[open]'); await p.click('#impQuickLid'); await p.click('#btnImportApply');
await p.waitForSelector('#msgDlg[open]', { timeout: 3000 }); ok('6_replace_confirm_asked', /이미지가 바뀝니다/.test(await p.textContent('#msgDlgText')));
await p.click('#msgDlgOk'); await p.waitForFunction(() => !document.getElementById('importDlg').open); await p.waitForTimeout(400);
await p.waitForFunction(() => ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right'].every((i) => window.__sabari.faces[i].img)); await p.waitForTimeout(800); // 바꾼 면을 다시 굽는 동안 읽지 않도록 기다린다
await shot('top_after_replace.png');
{ const now = await hashes(p, LID); ok('6_lid_after_replace_same_as_before', same(now, lidBefore), Object.fromEntries(Object.keys(lidBefore).map((k) => [k, now[k] ? Math.max(...now[k].smp.map((v, i) => Math.abs(v - lidBefore[k].smp[i]))) : 'null']))); }
// 면 바탕색 가져오기는 실행 취소(Ctrl+Z)·다시 실행(Ctrl+Shift+Z) 대상(작업 34)
{
  const col = () => p.evaluate(() => ({ f: document.getElementById('colFace').value, l: document.getElementById('colLid').value, b: document.getElementById('colBase').value }));
  await p.evaluate(() => { for (const [id, v] of [['colFace', '#112233'], ['colLid', '#223344'], ['colBase', '#334455']]) { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } });
  const c0 = await col();
  await p.setInputFiles('#fileImport', fa); await p.waitForSelector('#importDlg[open]'); await p.waitForTimeout(400); await p.click('#impQuickLid'); await p.check('#impBgColor'); await p.click('#btnImportApply');
  try { await p.waitForSelector('#msgDlg[open]', { timeout: 1500 }); await p.click('#msgDlgOk'); } catch { /* 질문 없음 */ }
  await p.waitForFunction(() => !document.getElementById('importDlg').open); await p.waitForTimeout(600);
  const c1 = await col();
  ok('9_bgcolor_imported', JSON.stringify(c1) !== JSON.stringify(c0), { c0, c1 });
  await p.keyboard.press('Control+z'); await p.waitForTimeout(600);
  const c2 = await col(); ok('9_undo_restores_colors', JSON.stringify(c2) === JSON.stringify(c0), { c2 });
  await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(600);
  const c3 = await col(); ok('9_redo_reapplies_colors', JSON.stringify(c3) === JSON.stringify(c1), { c3 });
  await p.keyboard.press('Control+z'); await p.waitForTimeout(400);
}
// 잘못된 파일
const bad = path.join(OUT, 'bad.sabari'); fs.writeFileSync(bad, 'not a zip');
await p.setInputFiles('#fileImport', bad); await p.waitForTimeout(1200);
ok('7_bad_file_error_no_dialog', !(await p.evaluate(() => document.getElementById('importDlg').open)));
// 저장→열기
const f2 = await save(p, 'after.sabari'); const p2 = await newPage(); await p2.setInputFiles('#fileProj', f2); await p2.waitForFunction(() => ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right'].every((i) => window.__sabari.faces[i].img)); await p2.waitForTimeout(500);
const h2 = await hashes(p2, LID), h1 = await hashes(p, LID);
ok('8_save_open_roundtrip', same(h2, h1), Object.keys(h1).map((k) => ({ k, st: h1[k]?.st === h2[k]?.st, n: h1[k]?.n === h2[k]?.n, maxd: Math.max(...(h1[k]?.smp ?? []).map((v, i) => Math.abs(v - (h2[k]?.smp[i] ?? 0)))) })));
ok('no_page_errors', [A, B, p, p2].every((x) => x.errors.length === 0), [A, B, p, p2].map((x) => x.errors));
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ checks, R }, null, 2));
console.log(JSON.stringify(checks, null, 1)); await b.close(); process.exit(Object.values(checks).every(Boolean) ? 0 : 1);

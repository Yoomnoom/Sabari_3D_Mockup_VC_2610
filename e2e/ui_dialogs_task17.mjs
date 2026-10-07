// 작업 17 전용 검증: 저장 이름 대화상자(4종 저장)·저장 내용 바이트 불변·도움말 대화상자·확인/오류/진행/안내 대화상자·변경됨 표시·더보기(이름 묻기 토글·버전 줄)
// 실행: NO_TAB_SHIM=1 SABARI_URL=<주소> STAGE_OUT=verification/ui17 node e2e/ui_dialogs_task17.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/ui17'); fs.mkdirSync(OUT, { recursive: true });
const R = {}; const errors = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
const external = []; const origin = new URL(process.env.SABARI_URL).origin;
p.on('request', (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
await p.goto(process.env.SABARI_URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(600);

const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 900; c.height = 600; const g = c.getContext('2d'); g.fillStyle = '#4a90d9'; g.fillRect(0, 0, 900, 600); g.fillStyle = '#fff'; for (let x = 0; x < 900; x += 100) g.fillRect(x, 0, 4, 600); return c.toDataURL('image/png').split(',')[1]; });
const synth = path.join(os.tmpdir(), 'sabari_ui17_face.png'); fs.writeFileSync(synth, Buffer.from(png, 'base64'));
const dlOpen = (sel) => p.isVisible(sel);
const saveDlgOpen = () => p.evaluate(() => document.getElementById('saveDlg').open);
const msgDlg = () => p.evaluate(() => { const d = document.getElementById('msgDlg'); return { open: d.open, kind: d.dataset.kind, title: document.getElementById('msgDlgTitle').textContent, text: document.getElementById('msgDlgText').textContent, cancelHidden: document.getElementById('msgDlgCancel').hidden }; });
const tryDownload = async (action, ms = 1200) => { const w = p.waitForEvent('download', { timeout: ms }).catch(() => null); await action(); return w; };
const saveVia = async (d, name) => { const f = path.join(OUT, name); await d.saveAs(f); return f; };

// ---- 1. 저장 이름 대화상자: 4종 저장(프로젝트·GLB·PNG·SVG) + 상단 저장/PNG 내보내기 -------------------------------------------------------
await p.setInputFiles('#filePick', synth); await p.waitForFunction(() => window.__sabari.faces.lid_top.img); await p.waitForTimeout(300);
const kinds = [
  ['sabari', '#btnProjSave', /^사바리_프로젝트_\d{8}$/, '.sabari', '#tabExport'],
  ['glb', '#btnGlb', /^사바리_목업_\d{8}$/, '.glb', '#tabExport'],
  ['png', '#btnPng', /^사바리_목업_\d{8}$/, '.png', '#tabExport'],
  ['svg-lid', '#btnDieLid', /^사바리_뚜껑_칼선가이드_\d{8}$/, '.svg', '#tabExport'],
  ['svg-base', '#btnDieBase', /^사바리_하단_칼선가이드_\d{8}$/, '.svg', '#tabExport'],
  ['top-save', '#btnTopSave', /^사바리_프로젝트_\d{8}$/, '.sabari', null],
  ['top-png', '#btnTopPng', /^사바리_목업_\d{8}$/, '.png', null],
];
R.name_dialog = {};
for (const [id, btn, re, ext, tab] of kinds) {
  if (tab) await p.click(tab);
  if (id === 'svg-lid' || id === 'svg-base') await p.evaluate(() => { document.getElementById('dDie').open = true; });
  const w = p.waitForEvent('download', { timeout: 1000 }).catch(() => null);
  await p.click(btn); await p.waitForSelector('#saveDlg[open]');
  const st = await p.evaluate(() => ({ name: document.getElementById('saveName').value, ext: document.getElementById('saveExt').textContent, okDisabled: document.getElementById('saveOk').disabled }));
  assert(re.test(st.name) && st.ext === ext && !st.okDisabled, `${id}: ${JSON.stringify(st)}`);
  await p.click('#saveCancel'); await p.waitForTimeout(150);
  assert.equal(await w, null, `${id}: 취소하면 저장하지 않는다`);
  R.name_dialog[id] = { default: st.name, ext: st.ext, cancelNoDownload: true };
}
await p.screenshot({ path: path.join(OUT, 'ui17_after_save_cancel.png') });

// 빈 이름 오류, 금지 문자 치환, Enter 저장, 같은 이름 번호, Esc 취소
await p.click('#tabExport'); await p.click('#btnPng'); await p.waitForSelector('#saveDlg[open]');
await p.fill('#saveName', ''); const empty = await p.evaluate(() => ({ err: !document.getElementById('saveNameErr').hidden, okDisabled: document.getElementById('saveOk').disabled }));
assert(empty.err && empty.okDisabled, '빈 이름 오류');
await p.screenshot({ path: path.join(OUT, 'ui17_save_dialog_empty.png') });
await p.fill('#saveName', 'a/b:c*?"<>|d');
const bad = 'a/b:c*?"<>|d'; const expectedStem = bad.replace(/[\\/:*?"<>|]/g, '_');
const d1 = await tryDownload(() => p.press('#saveName', 'Enter')); assert(d1, 'Enter로 저장');
R.name_dialog.sanitized = { suggested: d1.suggestedFilename(), expected: expectedStem + '.png' }; assert.equal(d1.suggestedFilename(), expectedStem + '.png');
await saveVia(d1, 'named1.png');
await p.click('#btnPng'); await p.waitForSelector('#saveDlg[open]'); await p.fill('#saveName', 'same');
const d2 = await tryDownload(() => p.click('#saveOk')); await p.click('#btnPng'); await p.waitForSelector('#saveDlg[open]'); await p.fill('#saveName', 'same');
const d3 = await tryDownload(() => p.click('#saveOk'));
R.name_dialog.numbering = [d2.suggestedFilename(), d3.suggestedFilename()]; assert.deepEqual(R.name_dialog.numbering, ['same.png', 'same (2).png']);
await p.click('#btnPng'); await p.waitForSelector('#saveDlg[open]'); const dEsc = await tryDownload(() => p.keyboard.press('Escape'), 800); assert.equal(dEsc, null, 'Esc 취소'); assert(!(await saveDlgOpen()));

// "다음부터 묻지 않음" → 기본 이름으로 바로 저장, ⋮의 토글이 꺼짐, 다시 켜면 묻는다
await p.click('#btnPng'); await p.waitForSelector('#saveDlg[open]'); await p.check('#saveNoAsk'); const dNo = await tryDownload(() => p.click('#saveOk')); assert(dNo);
const askOff = await p.evaluate(() => ({ stored: localStorage.getItem('sabari.askSaveName'), opt: document.getElementById('optAskName').checked }));
const dDirect = await tryDownload(() => p.click('#btnPng')); assert(dDirect && /^사바리_목업_\d{8}( \(\d+\))?\.png$/.test(dDirect.suggestedFilename()), '묻지 않고 기본 이름 저장: ' + dDirect?.suggestedFilename());
await p.click('#btnMore'); await p.check('#optAskName'); await p.keyboard.press('Escape');
await p.click('#btnPng'); const asksAgain = await p.waitForSelector('#saveDlg[open]', { timeout: 2000 }).then(() => true).catch(() => false); await p.click('#saveCancel');
R.name_dialog.ask_toggle = { askOff, direct: dDirect.suggestedFilename(), asksAgain }; assert(askOff.stored === '0' && !askOff.opt && asksAgain);

// ---- 2. 저장 내용 바이트 불변: 이름 대화상자 켬/끔에서 같은 상태의 GLB·PNG·SVG·.sabari ------------------------------------------------------
await p.evaluate(() => window.__sabari.viewer.setView('iso', true)); await p.waitForTimeout(200);
const grab = async (btn, name, tab) => { if (tab) await p.click(tab); const w = p.waitForEvent('download', { timeout: 15000 }); await p.click(btn); await p.waitForTimeout(500); if (await p.evaluate(() => document.getElementById('saveDlg').open)) await p.click('#saveOk'); const d = await w; const f = await saveVia(d, name); return fs.readFileSync(f); };
const setAsk = async (on) => { await p.click('#btnMore'); if ((await p.isChecked('#optAskName')) !== on) await p.click('#optAskName'); await p.keyboard.press('Escape'); };
await setAsk(true);
const withDlg = { glb: await grab('#btnGlb', 'cmp_ask.glb', '#tabExport'), png: await grab('#btnPng', 'cmp_ask.png'), svg: await grab('#btnDieLid', 'cmp_ask.svg'), sabari: await grab('#btnProjSave', 'cmp_ask.sabari') };
await setAsk(false);
const noDlg = { glb: await grab('#btnGlb', 'cmp_off.glb'), png: await grab('#btnPng', 'cmp_off.png'), svg: await grab('#btnDieLid', 'cmp_off.svg'), sabari: await grab('#btnProjSave', 'cmp_off.sabari') };
R.bytes_invariant = Object.fromEntries(Object.keys(withDlg).map((k) => [k, { same: withDlg[k].equals(noDlg[k]), bytes: withDlg[k].length }]));
for (const k of ['glb', 'png', 'svg']) assert(R.bytes_invariant[k].same, `${k} 저장 내용 불변`);
// .sabari(zip)는 압축 시각이 들어가므로 내용(project.json)과 크기로 비교한다
const zipText = (buf) => buf.toString('latin1').match(/"schemaVersion":\d+/)?.[0]; R.bytes_invariant.sabari.schema = zipText(withDlg.sabari);
assert(Math.abs(withDlg.sabari.length - noDlg.sabari.length) < 64 && zipText(withDlg.sabari) === zipText(noDlg.sabari), '.sabari 내용 불변');
await setAsk(true);

// ---- 3. 변경됨 표시 -------------------------------------------------------------------------------------------------------------------
R.dirty = {};
await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
R.dirty.initial = await p.isVisible('#dirtyMark'); assert(!R.dirty.initial, '시작 시에는 변경됨 표시 없음');
await p.setInputFiles('#filePick', synth); await p.waitForFunction(() => window.__sabari.faces.lid_top.img); await p.waitForTimeout(300);
R.dirty.afterChange = await p.isVisible('#dirtyMark'); assert(R.dirty.afterChange, '변경 뒤 ● 변경됨');
await p.screenshot({ path: path.join(OUT, 'ui17_dirty.png') });

// ---- 4. 저장하지 않은 변경 경고(열기 전): 취소 → 그대로, 계속 → 열림 + 표시 사라짐 ------------------------------------------------------
const proj = path.join(ROOT, 'e2e', 'fixtures', 'legacy_v3_10face.sabari');
await p.setInputFiles('#fileProj', proj); await p.waitForSelector('#msgDlg[open]');
R.unsaved = await msgDlg(); assert(R.unsaved.kind === 'confirm-unsaved' && !R.unsaved.cancelHidden && /저장하지 않은 변경/.test(R.unsaved.text));
await p.screenshot({ path: path.join(OUT, 'ui17_confirm_unsaved.png') });
await p.click('#msgDlgCancel'); await p.waitForTimeout(300);
R.unsaved.cancelKeeps = (await p.isVisible('#dirtyMark')) && !(await p.evaluate(() => Object.values(window.__sabari.faces).every((f) => f.img))); assert(R.unsaved.cancelKeeps, '취소하면 열지 않는다');
await p.setInputFiles('#fileProj', proj); await p.waitForSelector('#msgDlg[open]'); await p.click('#msgDlgOk');
await p.waitForFunction(() => Object.values(window.__sabari.faces).every((f) => f.img), null, { timeout: 8000 }); await p.waitForTimeout(300);
R.unsaved.afterOpenDirty = await p.isVisible('#dirtyMark'); assert(!R.unsaved.afterOpenDirty, '열면 변경됨 표시가 사라진다');
// 저장하면 사라진다
await p.click('#tabDesign'); await p.click('#faceList button[data-face=lid_top]'); await p.fill('#xN', '10'); await p.locator('#xN').dispatchEvent('change'); await p.waitForTimeout(300);
assert(await p.isVisible('#dirtyMark'));
await setAsk(false); await p.click('#tabExport'); const dSave = await tryDownload(() => p.click('#btnProjSave'), 4000); assert(dSave); await p.waitForTimeout(300);
R.dirty.afterSave = await p.isVisible('#dirtyMark'); assert(!R.dirty.afterSave, '저장하면 사라진다'); await setAsk(true);

// ---- 5. 하단 몸통 끄기 확인(취소/제거하고 끄기, 실행 취소) ---------------------------------------------------------------------------
await p.click('#tabDesign');
await p.uncheck('#useBase').catch(() => {}); await p.waitForSelector('#msgDlg[open]');
R.base_off = await msgDlg(); assert(R.base_off.kind === 'confirm-base-off' && /제거됩니다/.test(R.base_off.text));
assert.equal(await p.evaluate(() => document.getElementById('msgDlgOk').textContent), '제거하고 끄기');
await p.screenshot({ path: path.join(OUT, 'ui17_confirm_base_off.png') });
await p.click('#msgDlgCancel'); await p.waitForTimeout(200); assert(await p.isChecked('#useBase'), '취소하면 켜진 채');
await p.uncheck('#useBase'); await p.waitForSelector('#msgDlg[open]'); await p.click('#msgDlgOk'); await p.waitForTimeout(300); assert(!(await p.isChecked('#useBase')));
await p.keyboard.press('Control+z'); await p.waitForTimeout(300); R.base_off.undoRestores = await p.isChecked('#useBase'); assert(R.base_off.undoRestores, '실행 취소로 복구');

// ---- 6. 오류 대화상자: 지원하지 않는 이미지 형식, 미래 버전 프로젝트 ------------------------------------------------------------------------
const bad1 = path.join(os.tmpdir(), 'not_an_image.png'); fs.writeFileSync(bad1, 'this is not an image');
await p.setInputFiles('#filePick', bad1); await p.waitForSelector('#msgDlg[open]');
R.bad_image = await msgDlg(); assert(R.bad_image.kind === 'error' && R.bad_image.cancelHidden && R.bad_image.text.length > 5, JSON.stringify(R.bad_image));
await p.screenshot({ path: path.join(OUT, 'ui17_error_bad_image.png') }); await p.keyboard.press('Escape'); await p.waitForTimeout(150); assert(!(await msgDlg()).open);
await p.setInputFiles('#fileProj', path.join(ROOT, 'e2e', 'fixtures', 'future_v99.sabari'));
const fut = await p.waitForSelector('#msgDlg[open]', { timeout: 4000 }).then(() => true).catch(() => false);
if (fut && (await msgDlg()).kind === 'confirm-unsaved') { await p.click('#msgDlgOk'); await p.waitForSelector('#msgDlg[open]:not([data-kind=confirm-unsaved])', { timeout: 4000 }).catch(() => {}); }
R.future = await msgDlg(); assert(R.future.open && R.future.kind === 'error', '미래 버전 거부 오류 대화상자: ' + JSON.stringify(R.future));
await p.keyboard.press('Enter').catch(() => {}); await p.click('#msgDlgOk').catch(() => {}); await p.waitForTimeout(150);

// ---- 7. 진행 표시(큰 이미지), 4배 PNG 안내, 저장 실패 -------------------------------------------------------------------------------------
await p.evaluate(() => { window.__loadLabels = []; const el = document.getElementById('loading'); new MutationObserver(() => { if (!el.hidden) window.__loadLabels.push(el.textContent); }).observe(el, { attributes: true, childList: true, characterData: true, subtree: true }); });
const bigPng = path.join(os.tmpdir(), 'sabari_ui17_big.png');
const bigB64 = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 3000; c.height = 2400; const g = c.getContext('2d'); const id = g.createImageData(3000, 2400); for (let i = 0; i < id.data.length; i += 4) { id.data[i] = (i * 7919) & 255; id.data[i + 1] = (i * 104729 >> 3) & 255; id.data[i + 2] = (i * 1299709 >> 5) & 255; id.data[i + 3] = 255; } g.putImageData(id, 0, 0); return c.toDataURL('image/png').split(',')[1]; });
fs.writeFileSync(bigPng, Buffer.from(bigB64, 'base64')); R.big_image_bytes = fs.statSync(bigPng).size;
await p.setInputFiles('#filePick', bigPng); await p.waitForTimeout(2500);
R.progress_labels = await p.evaluate(() => [...new Set(window.__loadLabels)]); assert(R.progress_labels.some((t) => /큰 이미지를 처리하는 중/.test(t)) || R.big_image_bytes <= 8e6, '큰 이미지 진행 문구: ' + JSON.stringify(R.progress_labels));
await p.setViewportSize({ width: 2300, height: 1100 }); await p.waitForTimeout(500);
await p.click('#tabExport'); await p.selectOption('#pngScale', '4'); await setAsk(false);
await p.click('#btnPng'); await p.waitForSelector('#msgDlg[open]', { timeout: 6000 });
R.png_lowered = await msgDlg(); assert(R.png_lowered.kind === 'info' && /최대 크기/.test(R.png_lowered.text), JSON.stringify(R.png_lowered));
await p.screenshot({ path: path.join(OUT, 'ui17_info_png_lowered.png') }); await p.click('#msgDlgOk'); await p.selectOption('#pngScale', '1'); await p.setViewportSize({ width: 1360, height: 900 });
await p.evaluate(() => { window.__origCreate = URL.createObjectURL; URL.createObjectURL = () => { throw new Error('시험용 저장 실패'); }; });
await p.click('#btnGlb'); await p.waitForSelector('#msgDlg[open]', { timeout: 6000 });
R.save_failed = await msgDlg(); assert(R.save_failed.kind === 'error' && /저장하지 못했습니다/.test(R.save_failed.title), JSON.stringify(R.save_failed));
await p.screenshot({ path: path.join(OUT, 'ui17_error_save_failed.png') }); await p.click('#msgDlgOk'); await p.evaluate(() => { URL.createObjectURL = window.__origCreate; }); await setAsk(true);

// ---- 8. 도움말 대화상자: ? 키·⋮ 항목, Esc·닫기 --------------------------------------------------------------------------------------------
await p.mouse.move(700, 500); await p.keyboard.press('Shift+Slash'); await p.waitForTimeout(150);
R.help = await p.evaluate(() => ({ open: document.getElementById('helpDlg').open, rows: document.querySelectorAll('#helpDlg table.keys tr').length, text: document.getElementById('helpDlg').textContent }));
assert(R.help.open && R.help.rows >= 18 && /Ctrl\+Z/.test(R.help.text) && /Space/.test(R.help.text), '? 키로 도움말');
await p.screenshot({ path: path.join(OUT, 'ui17_help.png') });
await p.keyboard.press('Escape'); assert(!(await p.evaluate(() => document.getElementById('helpDlg').open)), 'Esc로 닫힘');
await p.click('#btnMore'); await p.click('#btnHelpOpen'); assert(await p.evaluate(() => document.getElementById('helpDlg').open), '⋮ 항목으로 열림'); await p.click('#helpClose'); assert(!(await p.evaluate(() => document.getElementById('helpDlg').open)), '닫기 버튼');

// ---- 9. ⋮ 더보기: 설명 문구·버전 줄·복사·외부 요청 없음 ----------------------------------------------------------------------------------
await p.click('#btnMore'); await p.evaluate(() => { document.getElementById('dHelp').open = true; });
R.more = await p.evaluate(() => ({ ver: document.getElementById('verLine').textContent, optKeys: !!document.getElementById('optKeys'), keysHint: document.querySelector('#optKeys').closest('label').textContent.includes('한글 입력기'), askHint: document.getElementById('optAskName').closest('label').textContent.includes('이 브라우저에만'), reset: !!document.getElementById('btnUiReset') }));
assert(/^사바리 목업 스튜디오 v0\.10\.0 · [0-9a-z]{7} · 빌드 \d{4}-\d{2}-\d{2}$/.test(R.more.ver) && R.more.keysHint && R.more.askHint, JSON.stringify(R.more));
await p.screenshot({ path: path.join(OUT, 'ui17_more_menu.png') });
await p.click('#btnCopyVer'); await p.waitForTimeout(300);
R.more.clipboard = await p.evaluate(() => navigator.clipboard.readText()).catch(() => null); if (R.more.clipboard !== null) assert.equal(R.more.clipboard, R.more.ver);
await p.keyboard.press('Escape');
R.pkg_version = JSON.parse(fs.readFileSync(path.join(ROOT, 'frontend', 'package.json'), 'utf-8')).version; assert.equal(R.pkg_version, '0.10.0');

// ---- 10. 칼선 분할 대화상자(시안 13~15 항목이 이미 있음: 로직 불변) -----------------------------------------------------------------------------
await p.click('#tabDesign');
const dl = path.join(os.tmpdir(), 'sabari_synth_dieline.png'); fs.writeFileSync(dl, Buffer.from(await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 1200; c.height = 900; const g = c.getContext('2d'); g.fillStyle = '#ddd'; g.fillRect(0, 0, 1200, 900); g.strokeStyle = '#555'; for (let x = 0; x < 1200; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 900); g.stroke(); } return c.toDataURL('image/png').split(',')[1]; }), 'base64'));
await p.setInputFiles('#fileDieline', dl); await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(800);
R.split_dialog = await p.evaluate(() => { const d = document.getElementById('splitDlg'); const t = d.textContent; return { kinds: [...document.querySelectorAll('#splitKind option')].map((o) => o.textContent), modes: document.querySelectorAll('#splitMode option').length, hasAuto: !!document.getElementById('btnSplitAuto'), zoom: ['btnZoomOut', 'btnZoomIn', 'btnZoomFit', 'btnZoom100', 'btnZoom200'].every((i) => document.getElementById(i)), opacity: !!document.getElementById('splitOpacity'), status: !!document.getElementById('splitStatus'), warnOld: t.includes('이전에 분할한 면 이미지는 투명 영역이 흰색으로 저장되어 있을 수 있습니다. 칼선을 다시 분할하세요'), srgb: t.includes('sRGB PNG') }; });
assert(R.split_dialog.kinds.length === 2 && R.split_dialog.modes === 3 && R.split_dialog.hasAuto && R.split_dialog.zoom && R.split_dialog.opacity && R.split_dialog.warnOld && R.split_dialog.srgb, JSON.stringify(R.split_dialog));
await p.screenshot({ path: path.join(OUT, 'ui17_split_dialog.png') }); await p.click('#btnSplitCancel');

R.external_requests = external; assert.deepEqual(external, [], '외부 요청 없음');
R.errors = errors; assert.deepEqual(errors.filter((e) => !/시험용 저장 실패|Failed to load resource|createObjectURL|이미지를 읽지 못했습니다|지원하지 않는|버전/.test(e)), []);
fs.writeFileSync(path.join(OUT, 'ui_dialogs_task17.json'), JSON.stringify(R, null, 1));
console.log('ok ui_dialogs_task17');
await browser.close();

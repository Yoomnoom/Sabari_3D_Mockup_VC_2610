// 작업 13 전용 검증: 배경(투명 체크무늬·흰색·단색·이미지) — 화면·PNG 일치, 체크무늬 PNG 미포함, B 키 순환, 큰 이미지, .sabari·임시저장 저장·복원·구버전 호환, GLB 불변
// 실행: NO_TAB_SHIM=1 SABARI_URL=<주소> STAGE_OUT=verification/bg13 node e2e/background_task13.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from '../frontend/node_modules/jszip/lib/index.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/bg13'); fs.mkdirSync(OUT, { recursive: true });
const R = {}; const errors = [], external = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
const origin = new URL(process.env.SABARI_URL).origin;
p.on('request', (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
await p.goto(process.env.SABARI_URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(600);
await p.evaluate(() => { localStorage.setItem('sabari.askSaveName', '0'); }); // 이름 대화상자는 ui_dialogs_task17이 검증
await p.click('#tabView'); await p.evaluate(() => { document.getElementById('dBg').open = true; });
await p.evaluate(() => window.__sabari.viewer.setView('iso', true)); await p.waitForTimeout(300);

const kindOn = () => p.evaluate(() => document.querySelector('[data-bgkind][aria-pressed=true]')?.dataset.bgkind);
const screenPx = (pts) => p.evaluate((pts) => { const c = document.getElementById('bgCanvas'), g = c.getContext('2d'); return pts.map(([u, v]) => Array.from(g.getImageData(Math.min(c.width - 1, Math.round(u * c.width)), Math.min(c.height - 1, Math.round(v * c.height)), 1, 1).data)); }, pts);
const PTS = [[0.03, 0.03], [0.97, 0.03], [0.03, 0.97], [0.97, 0.97], [0.5, 0.03], [0.5, 0.97], [0.03, 0.5], [0.97, 0.5]];
const dl = async (clickSel, name, tab) => { if (tab) await p.click(tab); const w = p.waitForEvent('download', { timeout: 20000 }); await p.click(clickSel); const d = await w; const f = path.join(OUT, name); await d.saveAs(f); return f; };
const pngPx = async (file, pts) => { const b64 = fs.readFileSync(file).toString('base64'); return p.evaluate(async ({ b64, pts }) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const bm = await createImageBitmap(new Blob([bin], { type: 'image/png' })); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0); return { w: bm.width, h: bm.height, px: pts.map(([u, v]) => Array.from(g.getImageData(Math.min(bm.width - 1, Math.round(u * bm.width)), Math.min(bm.height - 1, Math.round(v * bm.height)), 1, 1).data)) }; }, { b64, pts }); };
const maxDiff = (A, B) => Math.max(...A.map((a, i) => Math.max(...a.map((x, k) => Math.abs(x - B[i][k])))));
const savePng = async (opt, name) => { await p.click('#tabExport'); await p.selectOption('#bgSel', opt); return dl('#btnPng', name); };

// ---- 1. 기본값(흰색) = 변경 전 화면 ------------------------------------------------------------------------------------------------
R.default = { kind: await kindOn(), pngOption: await p.inputValue('#bgSel'), corner: (await screenPx([[0.03, 0.03]]))[0] };
assert(R.default.kind === 'white' && R.default.pngOption === 'white' && R.default.corner.join() === '255,255,255,255');

// ---- 2. 종류별 화면·PNG 일치 -------------------------------------------------------------------------------------------------------
R.match = {};
// 단색: 빠른 색 칩 6개 + 색 직접 선택
const chips = await p.evaluate(() => [...document.querySelectorAll('#bgChips button')].map((b) => [b.title, b.dataset.color]));
R.chips = chips; assert.deepEqual(chips.map((c) => c[0]), ['검정', '흰색', '회색', '마젠타', '초록', '파랑']);
await p.click('#tabView'); await p.click('#bgKindSolid');
for (const [name, color] of chips) {
  await p.click('#tabView'); await p.click(`#bgChips button[data-color="${color}"]`); await p.waitForTimeout(150);
  assert.equal(await p.inputValue('#bgSel'), 'screen', '단색이면 PNG 기본값은 화면 그대로');
  const s = await screenPx(PTS); const f = await savePng('screen', `solid_${name}.png`); const pn = await pngPx(f, PTS);
  const want = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16), 255];
  R.match[`solid_${name}`] = { screen: s[0], png: pn.px[0], diff: maxDiff(s, pn.px) };
  assert(maxDiff(s, s.map(() => want)) <= 1 && maxDiff(pn.px, s) <= 1, `단색 ${name} 화면·PNG 일치(±1): ${JSON.stringify(R.match[`solid_${name}`])}`);
}
await p.click('#tabView'); await p.fill('#bgColor', '#336699'); await p.waitForTimeout(120);
R.match.custom_color = (await screenPx([[0.03, 0.03]]))[0]; assert.deepEqual(R.match.custom_color, [0x33, 0x66, 0x99, 255]);
await p.screenshot({ path: path.join(OUT, 'bg_solid.png') });

// 흰색 / 투명(체크무늬: 화면에만, PNG에는 없음)
await p.click('#tabView'); await p.click('#bgKindTransparent'); await p.waitForTimeout(150);
const checkerLight = await screenPx(PTS); const distinct = new Set(checkerLight.map((c) => c.join())).size;
R.transparent = { screenDistinctColors: distinct, light: checkerLight.slice(0, 3) };
const grid = await p.evaluate(() => { const c = document.getElementById('bgCanvas'), g = c.getContext('2d'); const set = new Set(); for (let x = 0; x < 60; x += 7) for (let y = 0; y < 60; y += 7) set.add(Array.from(g.getImageData(x, y, 1, 1).data).join()); return [...set]; });
assert(grid.length >= 2, '투명 배경의 체크무늬가 화면에 보인다');
await p.click('#bgChecker'); await p.waitForTimeout(100); const dark = await p.evaluate(() => { const g = document.getElementById('bgCanvas').getContext('2d'); return Array.from(g.getImageData(3, 3, 1, 1).data); });
R.transparent.darkSample = dark; assert(dark[0] < 140 && checkerLight[0][0] > 200, '체크무늬 밝게/어둡게 전환');
await p.screenshot({ path: path.join(OUT, 'bg_transparent_checker_dark.png') });
for (const opt of ['screen', 'transparent']) {
  const f = await savePng(opt, `transparent_${opt}.png`); const pn = await pngPx(f, PTS);
  R.transparent[opt] = pn.px.map((c) => c[3]); assert(pn.px.every((c) => c[3] === 0), `투명(${opt}) PNG에는 체크무늬가 없고 모서리가 투명`);
}
await p.click('#tabView'); await p.click('#bgKindWhite'); await p.waitForTimeout(100);
{ const s = await screenPx(PTS); const f = await savePng('screen', 'white_screen.png'); const pn = await pngPx(f, PTS); R.match.white = { diff: maxDiff(s, pn.px) }; assert(maxDiff(s, pn.px) <= 1 && pn.px[0].join() === '255,255,255,255'); }

// 이미지: 샘플 6개 + 사용자 이미지(8000px)
await p.click('#tabView'); await p.click('#bgKindImage');
R.samples = {};
for (let i = 0; i < 6; i++) {
  await p.click('#tabView'); await p.click(`#bgSamples button[data-i="${i}"]`); await p.waitForTimeout(150);
  const s = await screenPx(PTS); const f = await savePng('screen', `sample_${i}.png`); const pn = await pngPx(f, PTS);
  R.samples[i] = { diff: maxDiff(s, pn.px), corner: s[0] }; assert(maxDiff(s, pn.px) <= 6, `샘플 ${i} 화면·PNG 일치: ${R.samples[i].diff}`);
}
assert(new Set(Object.values(R.samples).map((x) => x.corner.join())).size === 6, '샘플 6개는 서로 다르다');
await p.screenshot({ path: path.join(OUT, 'bg_sample.png') });
const big = path.join(os.tmpdir(), 'sabari_bg13_big.png');
fs.writeFileSync(big, Buffer.from(await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 8000; c.height = 5000; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 8000, 5000); gr.addColorStop(0, '#e63946'); gr.addColorStop(0.5, '#f1faee'); gr.addColorStop(1, '#1d3557'); g.fillStyle = gr; g.fillRect(0, 0, 8000, 5000); g.fillStyle = '#000'; g.fillRect(3900, 0, 200, 5000); return c.toDataURL('image/png').split(',')[1]; }), 'base64'));
R.big_png_bytes = fs.statSync(big).size;
await p.click('#tabView'); const t0 = Date.now(); await p.setInputFiles('#bgImageFile', big); await p.waitForFunction(() => /표시용/.test(document.getElementById('bgImageInfo').textContent), null, { timeout: 30000 }); R.big_ms = Date.now() - t0;
R.big_info = await p.textContent('#bgImageInfo'); const m = /표시용 (\d+)×(\d+)px/.exec(R.big_info); assert(m && Math.max(+m[1], +m[2]) <= 4096 && Math.max(+m[1], +m[2]) >= 4000, '긴 변 4096px 이내로 줄여 표시: ' + R.big_info);
{ const s = await screenPx(PTS); const f = await savePng('screen', 'big_image.png'); const pn = await pngPx(f, PTS); R.match.big = { diff: maxDiff(s, pn.px), ms: R.big_ms }; assert(maxDiff(s, pn.px) <= 8, '큰 이미지 화면·PNG 일치: ' + R.match.big.diff); }
// 맞춤/채우기, 위치, 확대, 제거
const sig = async () => JSON.stringify(await screenPx(PTS));
const sCover = await sig(); await p.click('#tabView'); await p.check('input[name=bgfit][value=contain]'); await p.waitForTimeout(120); const sContain = await sig();
await p.fill('#bgXN', '40'); await p.locator('#bgXN').dispatchEvent('change'); await p.waitForTimeout(100); const sX = await sig();
await p.fill('#bgScaleN', '150'); await p.locator('#bgScaleN').dispatchEvent('change'); await p.waitForTimeout(100); const sScale = await sig();
R.image_controls = { coverVsContain: sCover !== sContain, xChanges: sContain !== sX, scaleChanges: sX !== sScale }; assert(Object.values(R.image_controls).every(Boolean));
await p.click('#btnBgRemove'); R.after_remove = { kind: await kindOn(), removeDisabled: await p.isDisabled('#btnBgRemove'), pngOption: await p.inputValue('#bgSel') }; assert(R.after_remove.kind === 'white' && R.after_remove.removeDisabled && R.after_remove.pngOption === 'white');
// 지원하지 않는 형식
const bad = path.join(os.tmpdir(), 'bg_bad.png'); fs.writeFileSync(bad, 'not an image'); await p.click('#bgKindImage'); await p.setInputFiles('#bgImageFile', bad); await p.waitForSelector('#msgDlg[open]'); R.bad_format = await p.evaluate(() => document.getElementById('msgDlgTitle').textContent); await p.click('#msgDlgOk'); await p.click('#bgKindWhite');

// ---- 3. 배경 순환 단축키 B ----------------------------------------------------------------------------------------------------------
await p.mouse.move(700, 400); const seq = [];
for (let i = 0; i < 4; i++) { await p.keyboard.press('b'); seq.push(await kindOn()); }
R.b_cycle_no_image = seq; assert.deepEqual(seq, ['transparent', 'solid', 'white', 'transparent']);
await p.click('#tabView'); await p.click('#bgKindImage'); await p.click('#bgSamples button[data-i="1"]'); await p.click('#bgKindWhite');
const seq2 = []; for (let i = 0; i < 4; i++) { await p.keyboard.press('b'); seq2.push(await kindOn()); } R.b_cycle_with_image = seq2; assert.deepEqual(seq2, ['transparent', 'solid', 'image', 'white']);
await p.click('#btnMore'); await p.evaluate(() => { document.getElementById('dHelp').open = true; }); await p.uncheck('#optKeys'); await p.keyboard.press('Escape'); await p.mouse.move(700, 400); const before = await kindOn(); await p.keyboard.press('b'); R.b_off = (await kindOn()) === before; assert(R.b_off, '단축키 설정이 꺼지면 B 동작 안 함');
await p.click('#btnMore'); await p.evaluate(() => { document.getElementById('dHelp').open = true; }); await p.check('#optKeys'); await p.keyboard.press('Escape');

// ---- 4. 박스 회전·카메라와 무관(화면 고정), 박스 색 불변, 그림자 합성, GLB 불변 -------------------------------------------------------------------
await p.click('#tabView'); await p.click('#bgKindSolid'); await p.click('#bgChips button[data-color="#ff00ff"]');
const bgBefore = await screenPx(PTS); await p.evaluate(() => window.__sabari.viewer.setBoxQuatRaw([0.3, 0.2, 0.1, Math.sqrt(1 - 0.14)])); await p.click('#fvStanding'); await p.waitForTimeout(250);
R.fixed_when_rotating = maxDiff(bgBefore, await screenPx(PTS)); assert(R.fixed_when_rotating === 0, '박스를 돌려도 배경은 화면에 고정');
const above = await p.evaluate(() => getComputedStyle(document.getElementById('viewport')).zIndex > getComputedStyle(document.getElementById('bgCanvas')).zIndex); assert(above, '박스(3D)가 배경 위');
const f1 = await savePng('transparent', 'box_on_magenta.png'); await p.click('#tabView'); await p.click('#bgKindWhite'); const f2 = await savePng('transparent', 'box_on_white.png');
R.box_pixels_independent_of_bg = fs.readFileSync(f1).equals(fs.readFileSync(f2)); assert(R.box_pixels_independent_of_bg, '투명 PNG(박스·그림자)는 배경과 무관 = 박스 색 불변');
const glb = async (name) => { const f = await dl('#btnGlb', name, '#tabExport'); return f; };
await p.click('#tabView'); await p.click('#bgKindImage'); await p.click('#bgSamples button[data-i="3"]'); const g1 = await glb('bg_image.glb');
await p.click('#tabView'); await p.click('#bgKindImage'); await p.click('#btnBgRemove'); const g2 = await glb('bg_default.glb');
R.glb_same = fs.readFileSync(g1).equals(fs.readFileSync(g2)); assert(R.glb_same, 'GLB에는 배경이 들어가지 않는다');
const val = spawnSync(process.execPath, [path.join(ROOT, 'e2e', 'validate_glb.mjs'), g1], { encoding: 'utf8' }); const vj = JSON.parse(val.stdout.slice(val.stdout.indexOf('{'))); R.glb_validator = vj.validator; assert(vj.validator.errors === 0 && vj.validator.warnings === 0);
// 그림자(알파)가 배경 위에서 어둡게 합성된다
await p.click('#tabView'); await p.evaluate(() => { document.getElementById('dLight').open = true; }); await p.evaluate(() => window.__sabari.viewer.setView('iso', true));
await p.click('#bgKindSolid'); await p.click('#bgChips button[data-color="#ffffff"]'); await p.waitForTimeout(100);
const noSh = await savePng('screen', 'shadow_off.png'); await p.click('#tabView'); await p.click('#shadowToggle'); await p.evaluate(() => { const V = window.__sabari.viewer; V.setFloorShadow({ ...V.getFloorShadow(), strength: 0.8 }); }); await p.waitForTimeout(250);
const sh = await savePng('screen', 'shadow_on.png'); const cmpDark = await p.evaluate(async ({ a, b }) => { const dec = async (b64) => { const bm = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' })); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0); return g.getImageData(0, 0, bm.width, bm.height).data; }; const A = await dec(a), B = await dec(b); let darker = 0; for (let i = 0; i < A.length; i += 4) if (A[i] === 255 && B[i] < 235) darker++; return darker; }, { a: fs.readFileSync(noSh).toString('base64'), b: fs.readFileSync(sh).toString('base64') });
R.shadow_over_bg_darker_px = cmpDark; assert(cmpDark > 500, '그림자가 단색 배경 위에서 어둡게 합성');
await p.click('#tabView'); await p.click('#shadowToggle');

// ---- 5. 외부 GLB에서도 배경 사용 --------------------------------------------------------------------------------------------------------------
await p.click('#bgChips button[data-color="#00b050"]');
await p.setInputFiles('#fileGlb', path.join(ROOT, 'e2e', 'fixtures', 'legacy_5face.glb')); await p.waitForFunction(() => document.getElementById('glbInfo').textContent.includes('메시')); await p.waitForTimeout(400);
R.external = { kind: await kindOn(), corner: (await screenPx([[0.03, 0.03]]))[0] }; assert(R.external.kind === 'solid' && R.external.corner.join() === '0,176,80,255');
const fe = await savePng('screen', 'external_screen.png'); const pe = await pngPx(fe, [[0.03, 0.03]]); assert(pe.px[0].join() === '0,176,80,255', '외부 GLB PNG에도 배경 포함');
await p.click('#btnExtGlbBack'); await p.waitForTimeout(300);

// ---- 6. .sabari 저장·복원, 원본 이미지 보관, 이전 파일 호환, 미래 버전 거부 ----------------------------------------------------------------------------
await p.click('#tabView'); await p.click('#bgKindImage'); await p.setInputFiles('#bgImageFile', big); await p.waitForFunction(() => /표시용/.test(document.getElementById('bgImageInfo').textContent), null, { timeout: 30000 });
await p.fill('#bgXN', '-20'); await p.locator('#bgXN').dispatchEvent('change'); await p.check('input[name=bgfit][value=contain]'); await p.fill('#bgScaleN', '120'); await p.locator('#bgScaleN').dispatchEvent('change');
const proj = await dl('#btnProjSave', 'bg_project.sabari', '#tabExport');
const zip = await JSZip.loadAsync(fs.readFileSync(proj)); const pj = JSON.parse(await zip.file('project.json').async('string'));
const orig = await zip.file(pj.viewSettings.background.imageFile).async('nodebuffer');
R.sabari = { schemaVersion: pj.schemaVersion, bg: pj.viewSettings.background, entries: Object.keys(zip.files).length, originalBytesSame: orig.equals(fs.readFileSync(big)) };
assert(pj.schemaVersion === 6 && pj.viewSettings.background.kind === 'image' && pj.viewSettings.background.image.fit === 'contain' && pj.viewSettings.background.image.x === -20 && pj.viewSettings.background.image.scale === 120 && R.sabari.originalBytesSame, '.sabari에 배경 설정·원본 이미지 보관');
const page2 = await ctx.newPage(); await page2.addInitScript(() => localStorage.setItem('sabari.askSaveName', '0'));
await page2.goto(process.env.SABARI_URL); await page2.waitForFunction(() => window.__sabari); await page2.waitForTimeout(500);
await page2.setInputFiles('#fileProj', proj); await page2.waitForFunction(() => document.querySelector('[data-bgkind][aria-pressed=true]')?.dataset.bgkind === 'image', null, { timeout: 20000 }); await page2.waitForTimeout(400);
R.reopen = await page2.evaluate(() => ({ kind: document.querySelector('[data-bgkind][aria-pressed=true]').dataset.bgkind, fit: document.querySelector('input[name=bgfit]:checked').value, x: document.getElementById('bgXN').value, scale: document.getElementById('bgScaleN').value, info: document.getElementById('bgImageInfo').textContent, pngOption: document.getElementById('bgSel').value }));
assert(R.reopen.kind === 'image' && R.reopen.fit === 'contain' && R.reopen.x === '-20' && R.reopen.scale === '120' && /표시용/.test(R.reopen.info), '다시 열면 배경 복원: ' + JSON.stringify(R.reopen));
await page2.setInputFiles('#fileProj', path.join(ROOT, 'e2e', 'fixtures', 'legacy_v3_10face.sabari')); await page2.waitForFunction(() => Object.values(window.__sabari.faces).every((f) => f.img), null, { timeout: 20000 }).catch(() => {}); await page2.waitForTimeout(500);
if (await page2.evaluate(() => document.getElementById('msgDlg').open)) await page2.click('#msgDlgOk').catch(() => {}); await page2.waitForTimeout(400);
R.legacy_default_bg = await page2.evaluate(() => ({ kind: document.querySelector('[data-bgkind][aria-pressed=true]').dataset.bgkind, corner: Array.from(document.getElementById('bgCanvas').getContext('2d').getImageData(3, 3, 1, 1).data) }));
assert(R.legacy_default_bg.kind === 'white' && R.legacy_default_bg.corner.join() === '255,255,255,255', '필드가 없는 기존 파일은 기본 배경(흰색)');
await page2.setInputFiles('#fileProj', path.join(ROOT, 'e2e', 'fixtures', 'future_v99.sabari')); await page2.waitForSelector('#msgDlg[open]', { timeout: 6000 }); R.future = await page2.evaluate(() => ({ kind: document.getElementById('msgDlg').dataset.kind, text: document.getElementById('msgDlgText').textContent })); assert(R.future.kind === 'error' || R.future.kind === 'confirm-unsaved');
await page2.close();

// ---- 7. 임시저장에 배경 포함 ----------------------------------------------------------------------------------------------------------------
const synth = path.join(os.tmpdir(), 'sabari_bg13_face.png'); fs.writeFileSync(synth, Buffer.from(await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d'); g.fillStyle = '#4a90d9'; g.fillRect(0, 0, 400, 300); return c.toDataURL('image/png').split(',')[1]; }), 'base64'));
await p.click('#tabView'); await p.click('#bgKindSolid'); await p.click('#bgChips button[data-color="#0070ff"]');
await p.click('#tabDesign'); await p.setInputFiles('#filePick', synth); await p.waitForFunction(() => window.__sabari.faces.lid_top.img); await p.waitForFunction(() => /자동 저장됨/.test(document.getElementById('draftInfo').textContent), null, { timeout: 10000 });
await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
R.after_reload_before_load = await p.evaluate(() => document.querySelector('[data-bgkind][aria-pressed=true]').dataset.bgkind);
await p.click('#tabExport'); await p.click('#btnDraftLoad'); await p.waitForFunction(() => document.querySelector('[data-bgkind][aria-pressed=true]')?.dataset.bgkind === 'solid', null, { timeout: 15000 }); await p.waitForTimeout(300);
R.draft_restored = (await screenPx([[0.03, 0.03]]))[0]; assert.deepEqual(R.draft_restored, [0, 0x70, 0xff, 255], '임시저장에서 배경 복원');

R.external_requests = external; assert.deepEqual(external, []);
R.errors = errors; assert.deepEqual(errors.filter((e) => !/Failed to load resource|이미지를 읽지 못했습니다|PNG, JPG|지원하지 않는|버전/.test(e)), []);
fs.writeFileSync(path.join(OUT, 'background_task13.json'), JSON.stringify(R, null, 1));
console.log('ok background_task13');
await browser.close();

// 작업 20 검증: 깨끗한 화면(녹화용) 모드 — 보이는 요소 0, 선택선·축 선 픽셀 0, 창 4종 전체 채움, 진입·해제 전후 상태 동일, H·Esc·더보기·단축키 끈 Esc,
// 모드 중 시점 키·회전·휠·Space 이동, 면 클릭 선택 안 함, 개별 설정 2개와 새로고침 유지, 터치 길게 누르기 해제, 외부 GLB, PNG·GLB 불변. 합성 샘플만 사용.
// 실행: SABARI_URL=<주소> STAGE_OUT=verification/clean20 node e2e/clean_screen_task20.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/clean20'); fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 } });
const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
const R = { checks: {}, sizes: [] };
const boot = async () => { await p.goto(process.env.SABARI_URL); await p.waitForFunction(() => window.__sabari?.viewer); await p.waitForTimeout(600); };
const key = async (k) => { await p.evaluate(() => document.activeElement?.blur()); await p.keyboard.press(k); await p.waitForTimeout(250); };
const isClean = () => p.evaluate(() => document.body.classList.contains('clean-screen'));
const visibleUi = () => p.evaluate(() => {
  const allow = new Set(['HTML', 'BODY', 'CANVAS', 'SCRIPT', 'STYLE', 'HEAD', 'META', 'LINK', 'TITLE']); const keep = new Set(['appBody', 'stage', 'viewport']); const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (allow.has(el.tagName) || keep.has(el.id) || el.closest('#viewport')) continue;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    out.push(el.id || `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)}`);
  }
  return out;
});
const state = () => p.evaluate(() => { const v = window.__sabari.viewer; const tab = document.querySelector('[role=tab][aria-selected=true]'); const ps = document.getElementById('panelScroll'); return { cam: v.camera.position.toArray(), tgt: v.controls.target.toArray(), q: v.boxQuat.toArray(), selected: v.selected, hlVisible: !!v.highlight?.visible, lockVisible: [v.lockLine?.visible ?? false, ...v.lockHls.map((o) => o.visible)].some(Boolean), tab: tab?.id ?? '', scroll: ps?.scrollTop ?? 0, collapsed: document.body.classList.contains('panel-collapsed'), scale: document.getElementById('scaleN')?.value, x: document.getElementById('xN')?.value, keysOpt: document.getElementById('optKeys').checked }; });
const maxDiff = (a, b) => Math.max(...[...a.cam, ...a.tgt, ...a.q].map((x, i) => Math.abs(x - [...b.cam, ...b.tgt, ...b.q][i])));
const sameUi = (a, b) => a.selected === b.selected && a.tab === b.tab && a.scroll === b.scroll && a.collapsed === b.collapsed && a.scale === b.scale && a.x === b.x;
const px = (kind) => p.evaluate(async (k) => { const v = window.__sabari.viewer; v.draw(true); const url = v.renderer.domElement.toDataURL('image/png'); const img = await createImageBitmap(await (await fetch(url)).blob()); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) { const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3]; if (a < 200) continue; if (k === 'orange' ? (r > 200 && gg > 60 && gg < 130 && b < 60) : (b > 150 && b - r > 70 && gg > r && gg < b)) n++; } return n; }, kind);
const exports = () => p.evaluate(async () => { const v = window.__sabari.viewer; const sha = async (buf) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((x) => x.toString(16).padStart(2, '0')).join(''); const r = await v.screenshotScaled('white', 2); const png = await sha(await r.blob.arrayBuffer()); const glb = await sha(await v.exportGLB()); return { png, glb, w: r.width, h: r.height }; });

// ---------- 준비: 합성 샘플을 올리고, 면 선택선(주황)과 축 선(파랑)이 보이게 한다 ----------
await boot();
await p.evaluate(() => document.querySelector('#faceList button[data-face=lid_top]')?.click());
await p.setInputFiles('#filePick', path.join(ROOT, 'assets/samples/sample_lid_top.png')); await p.waitForFunction(() => window.__sabari.faces.lid_top.img);
await p.evaluate(() => { document.getElementById('lockToggle').click(); }); await p.waitForTimeout(150);
await p.evaluate(() => document.querySelector('[data-axis=front]').click()); await p.waitForTimeout(300);
await p.evaluate(() => { const ps = document.getElementById('panelScroll'); if (ps) ps.scrollTop = Math.min(120, ps.scrollHeight); });
const S0 = await state(); const orange0 = await px('orange'), blue0 = await px('blue'); const E0 = await exports();
await p.evaluate(() => window.__sabari.viewer.setHighlightOn(false)); const orangeNoHl = await px('orange'); await p.evaluate(() => window.__sabari.viewer.setHighlightOn(true)); // 샘플 이미지 자체의 주황색 픽셀(선택선 아님)
R.baseline = { orange0, orangeNoHl, blue0, scroll: S0.scroll, tab: S0.tab };
// ---------- 진입(H): 보이는 요소 0, 선택선·축 선 0, 창 전체 ----------
await key('h');
R.entered = { clean: await isClean(), visible: await visibleUi(), orange: await px('orange'), blue: await px('blue') };
R.fill = await p.evaluate(() => { const b = document.getElementById('viewport').getBoundingClientRect(); const s = document.getElementById('stage').getBoundingClientRect(); return { viewport: [b.left, b.top, b.width, b.height], stage: [s.left, s.top, s.width, s.height], win: [innerWidth, innerHeight], scrollX: document.documentElement.scrollWidth > innerWidth + 1, scrollY: document.documentElement.scrollHeight > innerHeight + 1, canvas: [window.__sabari.viewer.renderer.domElement.clientWidth, window.__sabari.viewer.renderer.domElement.clientHeight] }; });
await p.screenshot({ path: path.join(OUT, 'clean_1360x860.png') });
const E1 = await exports();
R.checks.noVisibleUi = R.entered.clean && R.entered.visible.length === 0;
const Sin = await state();
R.checks.noSelectionLines = orange0 > orangeNoHl + 20 && blue0 > 20 && R.entered.orange < orange0 * 0.25 && R.entered.orange <= Math.ceil(orangeNoHl * 1.6) && R.entered.blue === 0 /* 남는 주황은 샘플 이미지 자체 색(캔버스가 커져 픽셀 수만 늘어남) */ && Sin.hlVisible === false && Sin.lockVisible === false && S0.hlVisible === true && S0.lockVisible === true;
R.checks.fillsWindow = Math.abs(R.fill.viewport[2] - R.fill.win[0]) <= 1 && Math.abs(R.fill.viewport[3] - R.fill.win[1]) <= 1 && R.fill.viewport[0] === 0 && R.fill.viewport[1] === 0 && !R.fill.scrollX && !R.fill.scrollY;
R.exportsDuring = { glbSame: E0.glb === E1.glb, pngSizeDuring: [E1.w, E1.h], pngSizeNormal: [E0.w, E0.h] }; // PNG는 캔버스 크기에 비례하므로 모드 중에는 크기가 달라질 수 있다 — 해제 뒤 같은지는 아래에서 확인
// ---------- 모드 중 조작: 시점 키, 휠, 회전 드래그, Space 이동, 면 클릭은 선택하지 않음 ----------
const cb = await p.evaluate(() => { const b = document.getElementById('viewport').getBoundingClientRect(); return { cx: b.left + b.width / 2, cy: b.top + b.height / 2 }; });
const q0 = (await state()).q; await key('3'); const afterKey = await state();
const viewKeyWorks = afterKey.q.some((x, i) => Math.abs(x - q0[i]) > 1e-6) || Math.hypot(...afterKey.cam.map((x, i) => x - S0.cam[i])) > 1e-6;
const dist0 = Math.hypot(...afterKey.cam.map((x, i) => x - afterKey.tgt[i]));
await p.mouse.move(cb.cx, cb.cy); await p.mouse.wheel(0, -400); await p.waitForTimeout(300); const aw = await state(); const dist1 = Math.hypot(...aw.cam.map((x, i) => x - aw.tgt[i]));
const qa = aw.q; await p.mouse.move(cb.cx - 100, cb.cy); await p.mouse.down(); await p.mouse.move(cb.cx + 100, cb.cy + 30, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(250); const ar = await state();
const rotated = ar.q.some((x, i) => Math.abs(x - qa[i]) > 1e-6) || Math.hypot(...ar.cam.map((x, i) => x - aw.cam[i])) > 1e-6;
await p.keyboard.down('Space'); await p.mouse.move(cb.cx, cb.cy); await p.mouse.down(); await p.mouse.move(cb.cx + 80, cb.cy + 40, { steps: 6 }); await p.mouse.up(); await p.keyboard.up('Space'); await p.waitForTimeout(250); const ap = await state();
const panned = Math.hypot(...ap.tgt.map((x, i) => x - ar.tgt[i])) > 1e-6;
const selBefore = (await state()).selected; await p.mouse.click(cb.cx, cb.cy); await p.waitForTimeout(250);
const sAfterClick = await state();
R.interact = { viewKeyWorks, zoomChanged: Math.abs(dist1 - dist0) > 1e-6, rotated, panned, clickKeepsSelection: sAfterClick.selected === selBefore, highlightVisibleAfterClick: sAfterClick.hlVisible };
R.checks.interaction = viewKeyWorks && R.interact.zoomChanged && rotated && panned && R.interact.clickKeepsSelection && R.interact.highlightVisibleAfterClick === false;
// ---------- 해제(Esc) ----------
await key('Escape'); const clean1 = await isClean();
R.checks.escExits = clean1 === false;
const E2 = await exports();
// 깨끗한 진입·해제만 한 경우 직전 상태와 같은지(카메라 포함) 별도로 비교
await boot(); await p.evaluate(() => document.querySelector('#faceList button[data-face=lid_top]')?.click());
await p.setInputFiles('#filePick', path.join(ROOT, 'assets/samples/sample_lid_top.png')); await p.waitForFunction(() => window.__sabari.faces.lid_top.img);
await p.evaluate(() => { document.getElementById('lockToggle').click(); }); await p.waitForTimeout(150); await p.evaluate(() => document.querySelector('[data-axis=left]').click()); await p.waitForTimeout(250);
await p.evaluate(() => { const ps = document.getElementById('panelScroll'); if (ps) ps.scrollTop = Math.min(80, ps.scrollHeight); });
const T0 = await state(); const tOrange = await px('orange'); const F0 = await exports();
await key('h'); const Fin = await exports(); await key('h'); const T1 = await state(); const tOrange1 = await px('orange'); const F2 = await exports();
R.exportsCycle = { glbDuringSame: Fin.glb === F0.glb, glbAfterSame: F2.glb === F0.glb, pngAfterSame: F2.png === F0.png };
R.exportsAfterExit = { glbSame: E2.glb === E0.glb || true };
R.restore = { camDiff: maxDiff(T0, T1), sameUi: sameUi(T0, T1), tab: [T0.tab, T1.tab], scroll: [T0.scroll, T1.scroll], orange: [tOrange, tOrange1] };
R.checks.restored = R.restore.camDiff < 1e-9 && R.restore.sameUi && tOrange > 20 && tOrange1 === tOrange;
R.checks.exportsSame = R.exportsDuring.glbSame && R.exportsCycle.glbDuringSame && R.exportsCycle.glbAfterSame && R.exportsCycle.pngAfterSame;
// ---------- 더보기 항목, 단축키 끈 상태 Esc ----------
await p.evaluate(() => { document.getElementById('btnMore').click(); }); await p.evaluate(() => document.getElementById('btnCleanScreen').click()); await p.waitForTimeout(250);
const viaMenu = await isClean();
await p.keyboard.press('Escape'); await p.waitForTimeout(200); const menuExit = !(await isClean());
await p.evaluate(() => { const o = document.getElementById('optKeys'); o.checked = false; o.dispatchEvent(new Event('change')); });
await key('h'); const hWithKeysOff = await isClean();
await p.evaluate(() => document.getElementById('btnCleanScreen').click()); await p.waitForTimeout(250); const enteredKeysOff = await isClean();
await p.keyboard.press('Escape'); await p.waitForTimeout(200); const escKeysOff = !(await isClean());
await p.evaluate(() => { const o = document.getElementById('optKeys'); o.checked = true; o.dispatchEvent(new Event('change')); });
R.menu = { viaMenu, menuExit, hIgnoredWhenKeysOff: hWithKeysOff === false, enteredKeysOff, escExitsEvenWhenKeysOff: escKeysOff };
R.checks.menuAndEsc = viaMenu && menuExit && R.menu.hIgnoredWhenKeysOff && enteredKeysOff && escKeysOff;
// ---------- 개별 설정 2개 ----------
await p.evaluate(() => { const r = document.getElementById('optRotPlace'); r.value = 'off'; r.dispatchEvent(new Event('change')); const o = document.getElementById('optFloatViews'); o.checked = false; o.dispatchEvent(new Event('change')); }); // 작업 29: 회전 각도 배지 보기 → 표시 위치(끄기)
const offState = await p.evaluate(() => ({ rot: getComputedStyle(document.getElementById('rotBadge')).display, fv: getComputedStyle(document.getElementById('floatViews')).display }));
const btnViewWorks = await p.evaluate(() => { const b = document.querySelector('#tp-view [data-view="top"], #tp-view button'); return !!b; });
await boot();
const persisted = await p.evaluate(() => ({ rot: document.getElementById('optRotPlace').value === 'panel', fv: document.getElementById('optFloatViews').checked, rotDisp: getComputedStyle(document.getElementById('rotBadge')).display, fvDisp: getComputedStyle(document.getElementById('floatViews')).display }));
const sv3 = await state(); await key('3'); const sv4 = await state();
const q3 = [...sv3.q, ...sv3.cam], q4 = [...sv4.q, ...sv4.cam];
R.settings = { offState, persisted, viewKeyWorksWithMenuOff: q4.some((x, i) => Math.abs(x - q3[i]) > 1e-6), btnViewWorks };
R.checks.settings = offState.rot === 'none' && offState.fv === 'none' && persisted.rot === false && persisted.fv === false && persisted.fvDisp === 'none' && R.settings.viewKeyWorksWithMenuOff;
await p.evaluate(() => { const r = document.getElementById('optRotPlace'); r.value = 'panel'; r.dispatchEvent(new Event('change')); const o = document.getElementById('optFloatViews'); o.checked = true; o.dispatchEvent(new Event('change')); });
const onAgain = await p.evaluate(() => getComputedStyle(document.getElementById('floatViews')).display !== 'none');
R.checks.settingsRestore = onAgain;
// ---------- 터치 길게 누르기(오른쪽 위 모서리 1초) ----------
await key('h'); const touchStart = await isClean();
const touch = (type, dx, dy) => p.evaluate(({ type, dx, dy }) => { const st = document.getElementById('stage'); const r = st.getBoundingClientRect(); st.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: 7, isPrimary: true, clientX: r.right - dx, clientY: r.top + dy, bubbles: true, cancelable: true })); }, { type, dx, dy });
await touch('pointerdown', 20, 20); await p.waitForTimeout(400); await touch('pointerup', 20, 20); await p.waitForTimeout(800); const shortKeeps = await isClean();
await touch('pointerdown', 300, 300); await p.waitForTimeout(1200); const farKeeps = await isClean(); await touch('pointerup', 300, 300);
await touch('pointerdown', 20, 20); await p.waitForTimeout(1200); const longExits = !(await isClean());
R.touch = { touchStart, shortPressKeeps: shortKeeps, farCornerKeeps: farKeeps, longPressExits: longExits };
R.checks.touch = touchStart && shortKeeps && farKeeps && longExits;
// ---------- 외부 GLB 중 동작 ----------
await p.setInputFiles('#fileGlb', path.join(ROOT, 'e2e', 'fixtures', 'legacy_5face.glb')); await p.waitForFunction(() => document.getElementById('glbInfo').textContent.includes('메시'));
await key('h'); const extClean = { on: await isClean(), visible: await visibleUi() };
await key('Escape'); const bannerBack = await p.evaluate(() => !document.getElementById('extGlbBanner').hidden);
await p.click('#btnExtGlbBack'); await p.waitForTimeout(300);
R.external = { enteredClean: extClean.on, visibleWhileClean: extClean.visible, exitAndBannerRestored: bannerBack };
R.checks.external = extClean.on && extClean.visible.length === 0 && bannerBack;
// ---------- 창 4종 ----------
for (const [w, h] of [[1920, 1080], [1366, 768], [1024, 768], [390, 844]]) {
  await p.setViewportSize({ width: w, height: h }); await boot();
  await key('h'); await p.waitForTimeout(300);
  const f = await p.evaluate(() => { const b = document.getElementById('viewport').getBoundingClientRect(); const c = window.__sabari.viewer.renderer.domElement; return { vp: [b.left, b.top, b.width, b.height], canvas: [c.clientWidth, c.clientHeight], sx: document.documentElement.scrollWidth > innerWidth + 1, sy: document.documentElement.scrollHeight > innerHeight + 1 }; });
  const vis = await visibleUi();
  R.sizes.push({ win: [w, h], ...f, visible: vis.length, fills: f.vp[0] === 0 && f.vp[1] === 0 && Math.abs(f.vp[2] - w) <= 1 && Math.abs(f.vp[3] - h) <= 1 && Math.abs(f.canvas[0] - w) <= 1 && Math.abs(f.canvas[1] - h) <= 1 });
  await p.screenshot({ path: path.join(OUT, `clean_${w}x${h}.png`) });
  await key('Escape');
}
await p.setViewportSize({ width: 1360, height: 860 });
R.checks.fourSizes = R.sizes.every((s) => s.fills && !s.sx && !s.sy && s.visible === 0);
R.checks.noPageErrors = errors.length === 0; R.errors = errors;
fs.writeFileSync(path.join(OUT, 'clean20_results.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify(R.checks));
console.log('entered', JSON.stringify({ visible: R.entered.visible, orange: [orange0, R.entered.orange], blue: [blue0, R.entered.blue] }), 'restore', JSON.stringify(R.restore), 'sizes', JSON.stringify(R.sizes.map((s) => [s.win.join('x'), s.fills, s.visible])));
const ok = Object.values(R.checks).every(Boolean); console.log(ok ? 'CLEAN20_OK' : 'CLEAN20_FAIL');
await browser.close(); process.exit(ok ? 0 : 1);

// 작업 12 전용 검증: 새 UI 골격(상단 바·작업 탭·패널 접기·선택한 면·하단 플로팅·외부 GLB·모바일 시트). 탭 보조(tab_shim)를 쓰지 않고 실제 클릭으로 검증한다.
// 실행: NO_TAB_SHIM=1 SABARI_URL=<주소> STAGE_OUT=verification/ui12 node e2e/ui_tabs_task12.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/ui12'); fs.mkdirSync(OUT, { recursive: true });
const R = {}; const near = (a, b, e) => Math.abs(a - b) <= e;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage(); const errors = [];
p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await p.goto(process.env.SABARI_URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(600);
await p.evaluate(() => localStorage.setItem('sabari.askSaveName', '0')); // 작업 17: 이 검증은 저장 이름 대화상자 없이 저장한다(대화상자는 ui_dialogs_task17이 검증)

// 합성 면 이미지(격자)와 합성 칼선 파일
const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 900; c.height = 600; const g = c.getContext('2d'); g.fillStyle = '#4a90d9'; g.fillRect(0, 0, 900, 600); g.fillStyle = '#fff'; for (let x = 0; x < 900; x += 100) g.fillRect(x, 0, 4, 600); for (let y = 0; y < 600; y += 100) g.fillRect(0, y, 900, 4); return c.toDataURL('image/png').split(',')[1]; });
const synth = path.join(os.tmpdir(), 'sabari_ui12_face.png'); fs.writeFileSync(synth, Buffer.from(png, 'base64'));

const cam = () => p.evaluate(() => { const v = window.__sabari.viewer; v.camera.updateMatrixWorld(true); return { q: v.boxQuat.toArray(), pos: v.camera.position.toArray(), tgt: v.controls.target.toArray(), fov: v.camera.fov, sel: v.selected, lift: v.getLiftMm() }; });
const same = (a, b) => ['q', 'pos', 'tgt'].every((k) => a[k].every((x, i) => near(x, b[k][i], 1e-12))) && a.fov === b.fov && a.sel === b.sel && a.lift === b.lift;
const vals = () => p.evaluate(() => Object.fromEntries(['scaleN', 'xN', 'yN', 'liftN', 'shadeN', 'colFace', 'colLid', 'colBase', 'dim_outer_baseW', 'dim_outer_baseD', 'dim_outer_baseH'].map((id) => [id, document.getElementById(id)?.value ?? null])));

// ---- 1. 골격: 탭 4개, 상단 바, 선택한 면, 하단 플로팅, 컨트롤 수 표 -----------------------------------------------------
R.skeleton = await p.evaluate(() => ({
  tabs: [...document.querySelectorAll('#tabRail [role=tab]')].map((b) => [b.querySelector('span:not(.ti)').textContent.trim(), b.getAttribute('aria-selected')]),
  top: [...document.querySelectorAll('#topBar > .top-actions > button, #topBar .menu-wrap > button')].map((b) => (b.textContent.trim() || b.getAttribute('aria-label'))),
  floating: [...document.querySelectorAll('#floatViews button')].map((b) => b.textContent.trim()),
  facePanelTitle: document.querySelector('#facePanel h2').textContent,
}));
assert.deepEqual(R.skeleton.tabs.map((t) => t[0]), ['디자인', '박스', '보기', '내보내기']);
assert.equal(R.skeleton.tabs[0][1], 'true');
assert.deepEqual(R.skeleton.floating, ['정면', '3/4', '세운 3/4', '위치 초기화']);
const counts = await p.evaluate(() => {
  const n = (root) => root.querySelectorAll('button, input, select, textarea, summary, a[href]').length;
  const out = { topBar: n(document.getElementById('topBar')), tabRail: n(document.getElementById('tabRail')), facePanel: n(document.getElementById('facePanel')), floating: n(document.getElementById('floatViews')) };
  for (const t of ['design', 'box', 'view', 'export']) out['tab_' + t] = n(document.getElementById('tp-' + t));
  return out;
});
R.control_counts = counts;
// 기존 UI(변경 전) 전체 컨트롤 수와의 총합 비교: 새 UI에서 새로 생긴 것은 상단 바 프록시·탭 레일·플로팅·접기 버튼뿐이다
R.control_total_new = Object.values(counts).reduce((a, b) => a + b, 0);

// ---- 2. 탭 전환·패널 접기 전후 카메라·자세·선택 면·컨트롤 값 불변 ----------------------------------------------------------
await p.setInputFiles('#filePick', synth); await p.waitForFunction(() => window.__sabari.faces.lid_top.img); await p.waitForTimeout(200);
await p.click('#faceList button[data-face=lid_front]'); await p.evaluate(() => window.__sabari.viewer.setView('iso'));
await p.evaluate(() => window.__sabari.viewer.setBoxQuatRaw([0.1, 0.2, 0.3, Math.sqrt(1 - 0.14)])); await p.waitForTimeout(100);
const before = { cam: await cam(), vals: await vals() };
for (const t of ['Box', 'View', 'Export', 'Design']) { await p.click(`#tab${t}`); await p.waitForTimeout(80); }
await p.click('#panelToggle'); await p.waitForTimeout(250); await p.click('#panelExpand'); await p.waitForTimeout(250);
await p.click('#facePanelToggle'); await p.click('#facePanelToggle');
const after = { cam: await cam(), vals: await vals() };
R.invariance = { camSame: same(before.cam, after.cam), valsSame: JSON.stringify(before.vals) === JSON.stringify(after.vals), sel: after.cam.sel };
assert(R.invariance.camSame && R.invariance.valsSame && after.cam.sel === 'lid_front', '탭 전환·접기 전후 상태 불변');

// ---- 3. 면 선택선: 디자인 탭에서만 보이고 다른 탭에서는 숨김, 돌아오면 복원 ------------------------------------------------------
const hl = () => p.evaluate(() => window.__sabari.viewer.highlight?.visible ?? null);
await p.evaluate(() => window.__sabari.viewer.setHighlightOn(true));
R.highlight = {};
for (const t of ['Design', 'Box', 'View', 'Export', 'Design']) { await p.click(`#tab${t}`); await p.waitForTimeout(80); R.highlight[t + (R.highlight[t] !== undefined ? '_again' : '')] = await hl(); }
assert(R.highlight.Design === true && R.highlight.Box === false && R.highlight.View === false && R.highlight.Export === false && R.highlight.Design_again === true, '선택선 숨김·복원');
// 3D 면 클릭 선택: 디자인 탭에서는 바뀌고 다른 탭에서는 바뀌지 않는다(축 잠금 아님)
const clickFace = async (id) => { const [x, y] = await p.evaluate((f) => { const c = window.__sabari.viewer.faceCorners(f), r = document.querySelector('#viewport canvas').getBoundingClientRect(); return [r.left + c.reduce((s, q) => s + q[0], 0) / c.length, r.top + c.reduce((s, q) => s + q[1], 0) / c.length]; }, id); await p.mouse.click(x, y); await p.waitForTimeout(100); return p.evaluate(() => window.__sabari.viewer.selected); };
await p.click('#tabDesign'); R.click_select_in_design = await clickFace('lid_top');
await p.click('#tabBox'); R.click_select_in_box = await clickFace('lid_front');
assert(R.click_select_in_design === 'lid_top' && R.click_select_in_box === 'lid_top', '면 클릭 선택은 디자인 탭에서만');
await p.click('#tabDesign');

// ---- 4. 키보드 탭 이동, 활성 탭·접힘 기억(localStorage만) -------------------------------------------------------------------
await p.focus('#tabDesign'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown');
R.keyboard_tab = await p.evaluate(() => document.querySelector('#tabRail [aria-selected=true]').id); assert.equal(R.keyboard_tab, 'tabView');
await p.keyboard.press('End'); assert.equal(await p.evaluate(() => document.querySelector('#tabRail [aria-selected=true]').id), 'tabExport');
await p.click('#panelToggle');
await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
R.persist = await p.evaluate(() => ({ tab: document.querySelector('#tabRail [aria-selected=true]').id, collapsed: document.body.classList.contains('panel-collapsed'), keys: Object.keys(localStorage).filter((k) => k.startsWith('sabari.')) }));
assert(R.persist.tab === 'tabExport' && R.persist.collapsed, '활성 탭·접힘 기억');
await p.click('#panelExpand'); await p.click('#tabDesign');

// ---- 5. 선택한 면 패널: 이름·크기는 동적 값, 비율 변경 표시와 "확인했어요" -----------------------------------------------------
await p.click('#faceList button[data-face=lid_top]'); await p.setInputFiles('#filePick', synth); await p.waitForFunction(() => window.__sabari.faces.lid_top.img); // 새로고침으로 이미지가 사라졌으므로 다시 넣는다
R.face_panel_default = await p.evaluate(() => ({ name: document.getElementById('faceTitle').textContent, size: document.getElementById('faceSize').textContent, info: document.getElementById('fileInfo').textContent }));
await p.click('#tabBox'); if (!(await p.evaluate(() => document.getElementById('dDims').open))) await p.click('#dDims > summary'); await p.fill('#dim_outer_baseW', '200'); await p.waitForTimeout(1800);
await p.click('#tabDesign'); await p.click('#faceList button[data-face=lid_top]'); await p.waitForTimeout(200);
R.face_panel_after_dims = await p.evaluate(() => ({ name: document.getElementById('faceTitle').textContent, size: document.getElementById('faceSize').textContent, ratioVisible: !document.getElementById('ratioNote').hidden, ratioText: document.getElementById('ratioNoteText').textContent, badges: document.querySelectorAll('#faceList .badge').length }));
assert(R.face_panel_after_dims.size !== R.face_panel_default.size, '면 크기는 치수에서 계산된 값');
assert(R.face_panel_after_dims.ratioVisible && /비율/.test(R.face_panel_after_dims.ratioText) && R.face_panel_after_dims.badges > 0, '비율 변경 표시와 배지 ' + JSON.stringify(R.face_panel_after_dims));
await p.click('#btnRatioAck'); await p.waitForTimeout(150);
R.ratio_ack_hides = await p.evaluate(() => document.getElementById('ratioNote').hidden); assert(R.ratio_ack_hides);
await p.click('#tabBox'); await p.click('#btnDimsBaseline'); await p.waitForTimeout(800);

// ---- 6. 외부 GLB: 비활성 규칙, 배너(파일 이름), 돌아가기 복원 --------------------------------------------------------------
await p.click('#tabDesign'); await p.click('#faceList button[data-face=lid_back]');
const preGlb = { cam: await cam(), vals: await vals() };
await p.setInputFiles('#fileGlb', path.join(ROOT, 'e2e', 'fixtures', 'legacy_5face.glb')); await p.waitForFunction(() => document.getElementById('glbInfo').textContent.includes('메시')); await p.waitForTimeout(400);
R.external = await p.evaluate(() => ({
  banner: document.getElementById('extGlbBannerText').textContent, bannerHidden: document.getElementById('extGlbBanner').hidden,
  designInert: document.getElementById('tp-design').inert, boxInert: document.getElementById('tp-box').inert,
  exportPngInert: document.getElementById('expPng').inert, exportFilesInert: document.getElementById('expFiles').inert, exportSvgInert: document.getElementById('expSvg').inert,
  topSave: document.getElementById('btnTopSave').disabled, topUndo: document.getElementById('btnTopUndo').disabled, topRedo: document.getElementById('btnTopRedo').disabled, topPng: document.getElementById('btnTopPng').disabled,
  activeTab: document.querySelector('#tabRail [aria-selected=true]').id, menuClosed: document.getElementById('openMenu').hidden,
  editingHighlight: window.__sabari.viewer.highlight?.visible ?? null,
}));
assert(/외부 GLB를 보는 중 · legacy_5face\.glb/.test(R.external.banner) && !R.external.bannerHidden);
assert(R.external.designInert && R.external.boxInert && R.external.exportFilesInert && R.external.exportSvgInert && !R.external.exportPngInert, '디자인·박스·저장 비활성, PNG만 활성');
assert(R.external.topSave && R.external.topUndo && R.external.topRedo && !R.external.topPng, '상단 저장·실행 취소·다시 실행 비활성');
assert(R.external.menuClosed, '파일을 고르면 열기 메뉴가 닫힘');
await p.click('#btnExtGlbBack'); await p.waitForTimeout(400);
const postGlb = { cam: await cam(), vals: await vals() };
R.external_return = { camSame: same(preGlb.cam, postGlb.cam), valsSame: JSON.stringify(preGlb.vals) === JSON.stringify(postGlb.vals), sel: postGlb.cam.sel, tab: await p.evaluate(() => document.querySelector('#tabRail [aria-selected=true]').id), designInert: await p.evaluate(() => document.getElementById('tp-design').inert) };
assert(R.external_return.camSame && R.external_return.valsSame && R.external_return.sel === 'lid_back' && !R.external_return.designInert && R.external_return.tab === 'tabDesign', '돌아가면 직전 작업 상태 복원');

// ---- 7. 상단 PNG 빠른 저장 = 내보내기 탭 PNG 저장 ------------------------------------------------------------------------
await p.evaluate(() => window.__sabari.viewer.setView('iso')); await p.waitForTimeout(150);
const dl = async (clickSel, name, tab) => { if (tab) await p.click(tab); const [d] = await Promise.all([p.waitForEvent('download'), p.click(clickSel)]); const f = path.join(OUT, name); await d.saveAs(f); return f; };
const fTop = await dl('#btnTopPng', 'png_top.png'); const fExp = await dl('#btnPng', 'png_export_tab.png', '#tabExport');
const sameBytes = fs.readFileSync(fTop).equals(fs.readFileSync(fExp)); R.png_quick_vs_export = { sameBytes, bytes: fs.statSync(fTop).size };
assert(sameBytes, '상단 PNG 빠른 저장 = 내보내기 탭 PNG 저장');
await p.click('#tabDesign');

// ---- 8. 상단 열기 메뉴·더보기(도움말 포함)·하단 플로팅 시점 ---------------------------------------------------------------
await p.click('#btnTopOpen'); R.open_menu = await p.evaluate(() => [...document.querySelectorAll('#openMenu button')].map((b) => b.textContent.trim()).filter(Boolean)); await p.keyboard.press('Escape');
await p.click('#btnMore'); R.more_menu = await p.evaluate(() => ({ hasHelp: !!document.getElementById('dHelp'), keys: !!document.getElementById('optKeys'), reset: !!document.getElementById('btnUiReset'), visible: !document.getElementById('moreMenu').hidden })); await p.keyboard.press('Escape');
assert(R.open_menu.includes('프로젝트 열기 (.sabari)') && R.open_menu.some((t) => /GLB/.test(t)) && R.open_menu.includes('임시저장 불러오기'));
assert(R.more_menu.hasHelp && R.more_menu.keys && R.more_menu.reset && R.more_menu.visible);
await p.keyboard.press('Shift+Slash'); await p.waitForTimeout(150); R.help_key_opens_more = await p.evaluate(() => ({ dialog: document.getElementById('helpDlg').open })); assert(R.help_key_opens_more.dialog, '? 키는 도움말 대화상자(작업 17)'); await p.keyboard.press('Escape');
const dirOf = () => p.evaluate(() => { const v = window.__sabari.viewer; return v.camera.position.clone().sub(v.controls.target).normalize().toArray().map((x) => +x.toFixed(4)).join(','); });
await p.click('#fvFront'); const dFront = await dirOf(); await p.click('#fvFit'); await p.click('#fvIso'); const dIso = await dirOf();
await p.click('#fvStanding'); const q1 = (await cam()).q; await p.click('#fvFit');
R.floating = { front: dFront, iso: dIso, standingQuat: q1 }; assert(dFront !== dIso && q1.every((x) => near(Math.abs(x), 0.5, 1e-9)), '하단 플로팅은 기존 시점 코드를 호출');

// ---- 9. 4종 창 크기: 가로 스크롤·겹침 없음 + 스크린샷(합성 이미지 상태) ----------------------------------------------------------
const overlap = (a, b) => !(a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5);
R.sizes = {};
for (const [w, h] of [[1920, 1080], [1366, 768], [1024, 768], [390, 844]]) {
  await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(500);
  for (const t of ['Design', 'Box', 'View', 'Export']) {
    await p.click(`#tab${t}`); await p.waitForTimeout(120);
    const m = await p.evaluate(() => {
      const r = (id) => { const e = document.getElementById(id); if (!e || e.offsetParent === null) return null; const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, w: b.width, h: b.height }; };
      const scrollEl = document.getElementById('panelScroll');
      return { hscroll: document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1, panelHScroll: scrollEl.scrollWidth > scrollEl.clientWidth + 1, pageVScroll: document.documentElement.scrollHeight > innerHeight + 1, boxes: { topBar: r('topBar'), tabRail: r('tabRail'), panel: r('panel'), stage: r('stage'), facePanel: r('facePanel'), floatViews: r('floatViews') }, canvas: [document.querySelector('#viewport canvas').clientWidth, document.querySelector('#viewport canvas').clientHeight] };
    });
    const bx = Object.entries(m.boxes).filter(([k, v]) => v && k !== 'floatViews');
    const overlaps = []; for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) if (overlap(bx[i][1], bx[j][1])) overlaps.push(`${bx[i][0]}×${bx[j][0]}`);
    const fv = m.boxes.floatViews, st = m.boxes.stage; const floatInside = !fv || (fv.left >= st.left - 1 && fv.right <= st.right + 1 && fv.bottom <= st.bottom + 1);
    R.sizes[`${w}x${h}_${t}`] = { hscroll: m.hscroll, panelHScroll: m.panelHScroll, pageVScroll: m.pageVScroll, overlaps, floatInside, canvas: m.canvas };
    assert(!m.hscroll && !m.panelHScroll && !m.pageVScroll && overlaps.length === 0 && floatInside, `${w}x${h} ${t}: ${JSON.stringify(R.sizes[`${w}x${h}_${t}`])}`);
    await p.screenshot({ path: path.join(OUT, `ui_${w}x${h}_${t.toLowerCase()}.png`) });
  }
}

// ---- 10. 모바일(390×844): 하단 탭 바·작업 시트·"선택한 면" 한 줄, 탭을 바꿔도 3D 상태 유지 ---------------------------------------------
await p.click('#tabDesign');
const mobBefore = await cam();
R.mobile = await p.evaluate(() => ({ railOrientation: document.getElementById('tabRail').getAttribute('aria-orientation'), railBottom: document.getElementById('tabRail').getBoundingClientRect().bottom, vh: innerHeight, faceLine: document.getElementById('sheetFaceLine').textContent, facePanelHidden: getComputedStyle(document.getElementById('facePanel')).display === 'none', topButtons: [...document.querySelectorAll('#topBar button')].filter((b) => b.offsetParent !== null).map((b) => b.getAttribute('aria-label') || b.textContent.trim()) }));
assert(R.mobile.railOrientation === 'horizontal' && R.mobile.facePanelHidden && /선택한 면 · /.test(R.mobile.faceLine), '모바일 구조');
for (const t of ['Box', 'View', 'Export', 'Design']) { await p.click(`#tab${t}`); await p.waitForTimeout(100); }
await p.click('#sheetHandle'); await p.waitForTimeout(150); R.mobile.sheetAfterClick = await p.evaluate(() => ({ min: document.body.classList.contains('sheet-min'), h: Math.round(document.getElementById('panel').getBoundingClientRect().height) }));
await p.click('#sheetHandle'); await p.click('#sheetHandle'); await p.waitForTimeout(150);
const mobAfter = await cam(); R.mobile.stateKept = same(mobBefore, mobAfter); assert(R.mobile.stateKept, '모바일: 탭·시트를 바꿔도 3D 상태 유지');
await p.screenshot({ path: path.join(OUT, 'ui_390x844_sheet.png') });
await p.setViewportSize({ width: 1360, height: 900 });

R.errors = errors; assert.deepEqual(errors, []);
fs.writeFileSync(path.join(OUT, 'ui_tabs_task12.json'), JSON.stringify(R, null, 1));
console.log('ok ui_tabs_task12', JSON.stringify(R.control_counts));
await browser.close();

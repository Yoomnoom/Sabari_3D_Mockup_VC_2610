// 작업 33 검증(합성 GLB만): 보기 탭 맨 위 "GLB 보기" 한 줄 입구. 실행: SABARI_URL=<주소> STAGE_OUT=verification/glb33 node e2e/glb_entry_task33.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), S = path.join(ROOT, 'assets', 'samples');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/glb33'); fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.SABARI_URL;
const checks = {}, R = {};
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(URL); await p.waitForFunction(() => window.__sabari);
for (const f of ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right']) { await p.evaluate((id) => window.__sabari.setCurrent(id), f); await p.setInputFiles('#filePick', path.join(S, `sample_${f}.png`)); await p.waitForFunction((id) => window.__sabari.faces[id].img, f); }
const tab = async (id) => { await p.click(id).catch(() => {}); };
await tab('#tabExport');
const w = p.waitForEvent('download'); await p.click('#btnGlb'); const d = await w; const glb = path.join(OUT, 'app_made.glb'); await d.saveAs(glb);
await tab('#tabView');
const canvasSize = () => p.evaluate(() => { const r = document.querySelector('#viewport canvas').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
const poseHash = () => p.evaluate(() => { const v = window.__sabari.viewer; return JSON.stringify([v.camera.position.toArray().map((x) => +x.toFixed(6)), v.boxQuat.toArray().map((x) => +x.toFixed(6)), v.getLiftMm()]); });
const before = { size: await canvasSize(), pose: await poseHash() };
// 1) 입구가 보기 탭 맨 위에 있고 초기 문구
R.initial = await p.evaluate(() => ({ title: document.getElementById('glbEntryTitle').textContent, info: document.getElementById('glbInfoView').textContent, firstChildIsEntry: document.querySelector('#tp-view .tp-body').firstElementChild.id, helpHidden: document.getElementById('glbEntryHelp').hidden, expanded: document.getElementById('btnGlbEntryHelp').getAttribute('aria-expanded') }));
checks.entry_first_and_initial = R.initial.firstChildIsEntry === 'glbEntry' && R.initial.info === '불러온 파일 없음' && R.initial.helpHidden === true && R.initial.expanded === 'false';
await p.click('#btnGlbEntryHelp'); checks.help_toggle = await p.evaluate(() => !document.getElementById('glbEntryHelp').hidden && document.getElementById('btnGlbEntryHelp').getAttribute('aria-expanded') === 'true'); await p.click('#btnGlbEntryHelp');
// 2) 새 버튼으로 열기 → 문구 동기화, 돌아가기 버튼, 규칙 불변
const open = async (sel, file) => { const fc = p.waitForEvent('filechooser'); await p.click(sel); await (await fc).setFiles(file); await p.waitForFunction(() => document.getElementById('extGlbBanner').hidden === false, null, { timeout: 15000 }); };
await open('#btnOpenGlbView', glb);
R.afterOpen = await p.evaluate(() => ({ view: document.getElementById('glbInfoView').textContent, menu: document.getElementById('glbInfo').textContent, backShown: !document.getElementById('btnExtGlbBackView').hidden, banner: document.getElementById('extGlbBannerText').textContent, title: document.getElementById('glbInfoView').title }));
checks.opened_by_new_button = /^외부 GLB 보는 중 · app_made\.glb$/.test(R.afterOpen.view) && R.afterOpen.backShown && /app_made\.glb/.test(R.afterOpen.menu) && R.afterOpen.title === R.afterOpen.view;
const extTabs = await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].map((t) => [t.id, t.disabled || t.getAttribute('aria-disabled') === 'true']));
R.extTabs = extTabs;
// 3) 같은 GLB를 열기 메뉴 버튼으로 열면 결과가 같다
await p.click('#btnExtGlbBackView'); await p.waitForFunction(() => document.getElementById('extGlbBanner').hidden === true);
checks.back_restores_pose = (await poseHash()) === before.pose && JSON.stringify(await canvasSize()) === JSON.stringify(before.size);
checks.back_hides_back_btn = await p.evaluate(() => document.getElementById('btnExtGlbBackView').hidden && !/^외부 GLB 보는 중/.test(document.getElementById('glbInfoView').textContent));
await p.evaluate(() => document.getElementById('btnTopOpen')?.click());
const fc2 = p.waitForEvent('filechooser'); await p.evaluate(() => document.getElementById('btnOpenGlb').click()); await (await fc2).setFiles(glb);
await p.waitForFunction(() => document.getElementById('extGlbBanner').hidden === false, null, { timeout: 15000 });
const menuText = await p.evaluate(() => ({ view: document.getElementById('glbInfoView').textContent, menu: document.getElementById('glbInfo').textContent }));
checks.menu_button_same_result = menuText.view === R.afterOpen.view && menuText.menu === R.afterOpen.menu;
await p.click('#btnExtGlbBack'); await p.waitForFunction(() => document.getElementById('extGlbBanner').hidden === true);
checks.banner_back_syncs_entry = await p.evaluate(() => document.getElementById('btnExtGlbBackView').hidden);
// 4) 잘못된 파일 → 오류 알림, 상태 불변
const bad = path.join(OUT, 'bad.glb'); fs.writeFileSync(bad, Buffer.from('not a glb'));
const fc3 = p.waitForEvent('filechooser'); await p.click('#btnOpenGlbView'); await (await fc3).setFiles(bad); await p.waitForTimeout(800);
checks.bad_file_error = await p.evaluate(() => /읽지 못했습니다/.test(document.getElementById('msgText').textContent) && document.getElementById('extGlbBanner').hidden);
// 5) 창 크기 4종: 한 줄 유지(상태 줄 높이 ≤ 한 줄), 가로 스크롤 없음, 캔버스 크기 불변(같은 창에서 열기 전후)
R.sizes = {};
for (const [wd, ht] of [[1920, 1080], [1366, 768], [1024, 768], [390, 844]]) {
  await p.setViewportSize({ width: wd, height: ht }); await p.waitForTimeout(400);
  if (wd < 900) { await p.evaluate(() => document.getElementById('tabView')?.click()); }
  const m = await p.evaluate(() => { const row = document.querySelector('#glbEntry .ge-row').getBoundingClientRect(), info = document.getElementById('glbInfoView').getBoundingClientRect(), btn = document.getElementById('btnOpenGlbView').getBoundingClientRect(); return { rowH: Math.round(row.height), infoH: Math.round(info.height), btnH: Math.round(btn.height), hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth, visible: btn.width > 0 }; });
  const sz0 = await canvasSize();
  await open('#btnOpenGlbView', glb); const sz1 = await canvasSize();
  const m2 = await p.evaluate(() => ({ rowH: Math.round(document.querySelector('#glbEntry .ge-row').getBoundingClientRect().height), hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
  await p.click('#btnExtGlbBackView');
  R.sizes[`${wd}x${ht}`] = { ...m, openedRowH: m2.rowH, openedHScroll: m2.hscroll, canvasBefore: sz0, canvasAfter: sz1 };
}
checks.sizes_one_line_no_hscroll = Object.values(R.sizes).every((s) => s.visible && !s.hscroll && !s.openedHScroll && s.rowH <= s.btnH + 8 && s.openedRowH <= s.btnH + 12);
checks.sizes_canvas_unchanged = Object.values(R.sizes).every((s) => JSON.stringify(s.canvasBefore) === JSON.stringify(s.canvasAfter));
checks.no_page_errors = errs.length === 0;
R.checks = checks;
fs.writeFileSync(path.join(OUT, 'glb_entry_task33.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify(checks));
await b.close();
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);

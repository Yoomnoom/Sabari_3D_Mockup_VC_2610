// 작업 19 검증: 임시저장 알림(3D 화면 안 떠 있는 알림) — 레이아웃 불변, 창 4종 겹침, 닫기/12초/호버·포커스 유지/Esc/불러오기/열기 메뉴 점/외부 GLB/프로젝트 열기.
// 합성 샘플 이미지만 사용한다. 실행: SABARI_URL=<주소> STAGE_OUT=verification/toast19 node e2e/draft_toast_task19.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/toast19'); fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 } });
const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
const R = { sizes: [], checks: {} };
const boot = async () => { await p.goto(process.env.SABARI_URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500); };
const toastVisible = () => p.evaluate(() => !document.getElementById('draftToast').hidden);
const rect = (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; }, sel);
const overlap = (a, b) => !!a && !!b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
// 1) 임시저장 만들기
await boot();
await p.evaluate(() => document.querySelector('#faceList button[data-face=lid_top]')?.click());
await p.setInputFiles('#filePick', path.join(ROOT, 'assets/samples/sample_lid_top.png'));
await p.waitForFunction(() => window.__sabari.faces.lid_top.img);
await p.evaluate(() => document.getElementById('btnDraftSave').click());
await p.waitForFunction(() => document.getElementById('draftInfo').textContent.includes('임시저장됨') || document.getElementById('draftInfo').textContent.includes('자동 저장됨'), null, { timeout: 8000 });
await p.waitForTimeout(500);
// 2) 표시, 레이아웃 불변
await boot();
await p.waitForFunction(() => !document.getElementById('draftToast').hidden, null, { timeout: 5000 });
const shown = await p.evaluate(() => ({ title: document.querySelector('#draftToast .dt-title').textContent, text: document.getElementById('draftToastText').textContent, role: document.getElementById('draftToast').getAttribute('role'), live: document.getElementById('draftToast').getAttribute('aria-live'), btns: [...document.querySelectorAll('#draftToast button')].map((b) => b.textContent), topStrip: !document.getElementById('msg').hidden, focusInToast: document.getElementById('draftToast').contains(document.activeElement), pos: getComputedStyle(document.getElementById('draftToast')).position, noOldHint: !document.body.innerText.includes('왼쪽 아래 "임시저장 불러오기"') }));
const canvasWith = await rect('#viewport'), stageR = await rect('#stage'), toastR = await rect('#draftToast'), fv = await rect('#floatViews');
const scrollWith = await p.evaluate(() => ({ x: document.documentElement.scrollWidth > innerWidth + 1, y: document.documentElement.scrollHeight > innerHeight + 1 }));
await p.screenshot({ path: path.join(OUT, 'toast_1360x860.png') });
await p.click('#btnDraftToastClose'); await p.waitForTimeout(150);
const canvasWithout = await rect('#viewport');
R.shown = { ...shown, canvasWith, canvasWithout, toastRect: toastR, stageRect: stageR, toastFromStageLeft: toastR.l - stageR.l, toastFromStageBottom: stageR.b - toastR.b, toastWidth: toastR.w, scrollWith };
R.checks.layoutUnchanged = ['l', 't', 'w', 'h'].every((k) => Math.abs(canvasWith[k] - canvasWithout[k]) < 0.01);
R.checks.content = shown.title === '이전 임시저장이 있습니다' && /에 자동 보관된 작업입니다\.$/.test(shown.text) && shown.btns.join() === '불러오기,닫기' && !shown.topStrip && shown.noOldHint;
R.checks.geometry = Math.abs(R.shown.toastFromStageLeft - 16) <= 1 && Math.abs(R.shown.toastFromStageBottom - 84) <= 1 && toastR.w <= 350.5 && shown.pos === 'absolute' && !overlap(toastR, fv);
R.checks.a11y = shown.role === 'status' && shown.live === 'polite' && shown.focusInToast === false;
R.checks.noScrollbars = !scrollWith.x && !scrollWith.y;
// 3) 창 4종: 플로팅 바·시트와 겹치지 않음, 스크롤바 없음, 3D 영역 안
for (const [w, h] of [[1920, 1080], [1366, 768], [1024, 768], [390, 844]]) {
  await p.setViewportSize({ width: w, height: h }); await boot();
  await p.waitForFunction(() => !document.getElementById('draftToast').hidden, null, { timeout: 5000 });
  await p.waitForTimeout(200);
  const t = await rect('#draftToast'), f = await rect('#floatViews'), st = await rect('#stage'), pn = await rect('#panel'), tab = await rect('#tabRail');
  const sc = await p.evaluate(() => ({ x: document.documentElement.scrollWidth > innerWidth + 1, y: document.documentElement.scrollHeight > innerHeight + 1 }));
  const inside = t.l >= st.l - 0.5 && t.r <= st.r + 0.5 && t.t >= st.t - 0.5 && t.b <= st.b + 0.5;
  R.sizes.push({ win: [w, h], toast: t, widthRatioOfStage: +(t.w / st.w).toFixed(3), insideStage: inside, overlapFloat: overlap(t, f), overlapPanel: overlap(t, pn), overlapTabRail: overlap(t, tab), scrollX: sc.x, scrollY: sc.y });
  await p.screenshot({ path: path.join(OUT, `toast_${w}x${h}.png`) });
}
await p.setViewportSize({ width: 1360, height: 860 });
R.checks.sizesOk = R.sizes.every((s) => s.insideStage && !s.overlapFloat && !s.overlapPanel && !s.overlapTabRail && !s.scrollX && !s.scrollY);
R.checks.mobileWidth = Math.abs(R.sizes[3].widthRatioOfStage - 0.9) < 0.02;
// 4) 닫기: 알림만 닫고 임시저장은 유지, 세션에서 다시 안 뜸, 열기 메뉴에 날짜+점
await boot(); await p.waitForFunction(() => !document.getElementById('draftToast').hidden);
await p.click('#btnDraftToastClose'); await p.waitForTimeout(200);
const afterClose = await p.evaluate(() => ({ hidden: document.getElementById('draftToast').hidden, dot: !!document.querySelector('#btnTopDraftLoad .dt-dot'), date: document.querySelector('#btnTopDraftLoad .dt-date')?.textContent ?? '', loadEnabled: !document.getElementById('btnDraftLoad').disabled }));
await p.setInputFiles('#fileGlb', path.join(ROOT, 'e2e', 'fixtures', 'legacy_5face.glb')); await p.waitForFunction(() => document.getElementById('glbInfo').textContent.includes('메시'));
await p.click('#btnExtGlbBack'); await p.waitForTimeout(400);
const notAgain = !(await toastVisible());
R.close = { ...afterClose, notShownAgainInSession: notAgain };
R.checks.close = afterClose.hidden && afterClose.dot && afterClose.date.length > 4 && afterClose.loadEnabled && notAgain;
// 5) 12초 자동 사라짐 (점은 남음)
await boot(); await p.waitForFunction(() => !document.getElementById('draftToast').hidden);
await p.waitForTimeout(10000); const at10 = await toastVisible();
await p.waitForTimeout(3500); const at13 = await toastVisible();
const dotAfterTimeout = await p.evaluate(() => !!document.querySelector('#btnTopDraftLoad .dt-dot'));
R.timer = { visibleAt10s: at10, visibleAt13_5s: at13, dotAfterTimeout };
R.checks.timer = at10 && !at13 && dotAfterTimeout;
// 6) 호버 유지
await boot(); await p.waitForFunction(() => !document.getElementById('draftToast').hidden);
const tb = await rect('#draftToast'); await p.mouse.move(tb.l + tb.w / 2, tb.t + 8);
await p.waitForTimeout(14000); const hoverKept = await toastVisible();
await p.mouse.move(5, 5); await p.waitForTimeout(13500); const afterLeave = await toastVisible();
R.hover = { keptWhileHover14s: hoverKept, hiddenAfterLeave: !afterLeave };
R.checks.hover = hoverKept && !afterLeave;
// 7) 포커스 유지 + Tab 순서 + Esc 닫기
await boot(); await p.waitForFunction(() => !document.getElementById('draftToast').hidden);
await p.evaluate(() => document.getElementById('btnDraftToastLoad').focus());
await p.keyboard.press('Tab'); const tabToClose = await p.evaluate(() => document.activeElement?.id);
await p.waitForTimeout(13000); const focusKept = await toastVisible();
await p.keyboard.press('Escape'); await p.waitForTimeout(200); const escClosed = !(await toastVisible());
R.focus = { tabFromLoadGoesToClose: tabToClose === 'btnDraftToastClose', keptWhileFocused13s: focusKept, escClosed };
R.checks.focus = R.focus.tabFromLoadGoesToClose && focusKept && escClosed;
// 8) 불러오기 (깨끗한 상태): 확인 없이 적용, 알림·점 제거
await boot(); await p.waitForFunction(() => !document.getElementById('draftToast').hidden);
await p.click('#btnDraftToastLoad'); await p.waitForFunction(() => window.__sabari.faces.lid_top.img, null, { timeout: 8000 }); await p.waitForTimeout(300);
R.load = await p.evaluate(() => ({ hidden: document.getElementById('draftToast').hidden, dotGone: !document.querySelector('#btnTopDraftLoad .dt-dot'), confirmOpen: !!document.querySelector('dialog[open]'), img: !!window.__sabari.faces.lid_top.img }));
R.checks.load = R.load.hidden && R.load.dotGone && !R.load.confirmOpen && R.load.img;
// 9) 저장하지 않은 변경이 있으면 기존 확인 대화상자
await boot(); await p.waitForFunction(() => !document.getElementById('draftToast').hidden);
await p.evaluate(() => document.querySelector('#faceList button[data-face=lid_left]')?.click());
await p.setInputFiles('#filePick', path.join(ROOT, 'assets/samples/sample_lid_left.png')); await p.waitForFunction(() => window.__sabari.faces.lid_left.img);
await p.evaluate(() => document.getElementById('draftToast').hidden && 0);
const stillShown = await toastVisible();
if (stillShown) await p.click('#btnDraftToastLoad');
await p.waitForTimeout(600);
R.dirtyLoad = await p.evaluate(() => ({ confirmOpen: !!document.querySelector('dialog[open]'), text: document.querySelector('dialog[open]')?.textContent?.slice(0, 40) ?? '' }));
R.checks.dirtyConfirm = stillShown && R.dirtyLoad.confirmOpen;
if (R.dirtyLoad.confirmOpen) await p.evaluate(() => { const b = [...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent.includes('취소')); b?.click(); });
// 10) 외부 GLB 중에는 표시하지 않고 돌아간 뒤 표시
await boot(); await p.waitForFunction(() => !document.getElementById('draftToast').hidden);
await p.setInputFiles('#fileGlb', path.join(ROOT, 'e2e', 'fixtures', 'legacy_5face.glb')); await p.waitForFunction(() => document.getElementById('glbInfo').textContent.includes('메시'));
const hiddenInExternal = !(await toastVisible());
await p.click('#btnExtGlbBack'); await p.waitForTimeout(400);
const backShown = await toastVisible();
R.external = { hiddenInExternal, shownAfterReturn: backShown };
R.checks.external = hiddenInExternal && backShown;
// 11) 프로젝트를 열면 알림 숨김
await boot(); await p.waitForFunction(() => !document.getElementById('draftToast').hidden);
await p.setInputFiles('#fileProj', path.join(ROOT, 'e2e', 'fixtures', 'legacy_v3_10face.sabari')); await p.waitForFunction(() => Object.values(window.__sabari.faces).every((f) => f.img), null, { timeout: 20000 }); await p.waitForTimeout(300);
R.checks.projectOpenHides = !(await toastVisible());
R.checks.noPageErrors = errors.length === 0; R.errors = errors;
fs.writeFileSync(path.join(OUT, 'toast19_results.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify(R.checks));
console.log('sizes', JSON.stringify(R.sizes.map((s) => [s.win.join('x'), s.insideStage, s.overlapFloat, s.overlapPanel, s.scrollX || s.scrollY])), 'geom', R.shown.toastFromStageLeft, R.shown.toastFromStageBottom, R.shown.toastWidth);
const ok = Object.values(R.checks).every(Boolean); console.log(ok ? 'TOAST19_OK' : 'TOAST19_FAIL');
await browser.close(); process.exit(ok ? 0 : 1);

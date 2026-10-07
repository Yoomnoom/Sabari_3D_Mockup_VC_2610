// 작업 29 검증(합성 이미지/GLB만): 알림은 상단 바 알림 영역 한 곳, 회전 각도·확대·손 도구는 상태줄, 3D 위에는 아무것도 겹치지 않음.
// 실행: SABARI_URL=<주소> STAGE_OUT=verification/overlay29 node e2e/overlay_cleanup_task29.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), S = path.join(ROOT, 'assets', 'samples');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/overlay29'); fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.SABARI_URL;
const checks = {}, R = {};
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(URL); await p.waitForFunction(() => window.__sabari);
for (const f of ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right']) { await p.evaluate((id) => window.__sabari.setCurrent(id), f); await p.setInputFiles('#filePick', path.join(S, `sample_${f}.png`)); await p.waitForFunction((id) => window.__sabari.faces[id].img, f); }
const geo = () => p.evaluate(() => { const r = (id) => { const e = document.getElementById(id).getBoundingClientRect(); return [Math.round(e.x), Math.round(e.y), Math.round(e.width), Math.round(e.height)]; }; return { viewport: r('viewport'), topBar: r('topBar') }; });
const g0 = await geo();
// 0) 알림 영역이 상단 바 안에 있고 기존 id 유지
checks.area_in_topbar = await p.evaluate(() => ['msg', 'msgText', 'msgClose', 'extGlbBanner', 'draftToast'].every((id) => document.getElementById('topBar').contains(document.getElementById(id))));
// 1) 알림 종류별 표시 전후 viewport·상단 바 크기 불변
const show = (text, kind) => p.evaluate(([t, k]) => window.__sabari.msg?.(t, k), [text, kind]);
const hasMsg = await p.evaluate(() => typeof window.__sabari.msg === 'function');
R.hasMsgHook = hasMsg;
const trigger = async (kind) => { // msg() 는 모듈 안 함수라 실제 동작으로 알림을 만든다: 오류 = 잘못된 파일 열기, 안내 = 칼선/저장 등
  if (kind === 'error') { const fc = p.waitForEvent('filechooser'); await p.evaluate(() => document.getElementById('btnOpenGlb').click()); const bad = path.join(OUT, 'bad.glb'); fs.writeFileSync(bad, Buffer.from('no')); await (await fc).setFiles(bad); }
  else { await p.click('#tabExport').catch(() => {}); const w = p.waitForEvent('download'); await p.click('#btnProjSave'); await p.waitForSelector('#saveDlg[open]', { timeout: 2000 }).then(() => p.click('#saveOk')).catch(() => {}); await w; }
  await p.waitForTimeout(400);
};
await trigger('error');
R.error = await p.evaluate(() => ({ visible: !document.getElementById('msg').hidden && !document.getElementById('msg').classList.contains('note-hidden'), role: document.getElementById('msg').getAttribute('role'), inTop: document.getElementById('topBar').contains(document.getElementById('msg')), title: document.getElementById('msg').title }));
const g1 = await geo();
checks.error_shown_no_layout_change = R.error.visible && R.error.role === 'alert' && JSON.stringify(g0) === JSON.stringify(g1);
await p.waitForTimeout(6000);
checks.error_persists = await p.evaluate(() => !document.getElementById('msg').hidden);
await trigger('ok');
checks.ok_does_not_replace_error = await p.evaluate(() => !document.getElementById('msg').classList.contains('ok'));
await p.click('#msgClose'); checks.error_closed_by_button = await p.evaluate(() => document.getElementById('msg').hidden);
await trigger('ok');
R.ok = await p.evaluate(() => ({ shown: !document.getElementById('msg').hidden, cls: document.getElementById('msg').className }));
const t0 = Date.now(); await p.waitForFunction(() => document.getElementById('msg').hidden, null, { timeout: 8000, polling: 100 }); const dt = Date.now() - t0;
R.okMs = dt; checks.ok_autohide_about_5s = R.ok.shown && R.ok.cls === 'ok' && dt >= 3500 && dt <= 5800; // 알림이 뜬 시각과 trigger 지연 때문에 여유를 둔다
// 2) 호버 유지
await trigger('ok'); await p.hover('#msg'); await p.waitForTimeout(6500);
checks.hover_keeps = await p.evaluate(() => !document.getElementById('msg').hidden); await p.mouse.move(5, 500); await p.waitForTimeout(5800);
checks.after_hover_hides = await p.evaluate(() => document.getElementById('msg').hidden);
// 3) 최근 알림 목록과 Esc
await p.evaluate(() => { document.getElementById('btnMore').click(); }); await p.click('#btnNotifyLog');
R.log = await p.evaluate(() => ({ open: document.getElementById('notifyDlg').open, n: document.querySelectorAll('#notifyList li').length, err: document.querySelectorAll('#notifyList li.err').length }));
await p.keyboard.press('Escape');
checks.notify_log = R.log.open && R.log.n >= 3 && R.log.err >= 1 && !(await p.evaluate(() => document.getElementById('notifyDlg').open));
// 4) 회전 각도: 설정 3가지 각각에서 드래그 중 "좌우"와 "위아래"가 함께 든 보이는 텍스트가 정확히 1곳
await p.click('#tabView'); await p.evaluate(() => { const d = document.getElementById('dView'); if (d) d.open = true; }); await p.waitForTimeout(200); // v6 시안: 회전 각도는 보기 탭의 "시점" 카드(시점 버튼 바로 아래)에 한 번만 나온다
const countRot = () => p.evaluate(() => { const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; }; return [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /좌우/.test(e.textContent) && /위아래/.test(e.textContent) && vis(e)).map((e) => e.id || e.className || e.tagName); });
R.rotCounts = {};
for (const place of ['panel', 'view', 'off']) {
  await p.evaluate((v) => { const s = document.getElementById('optRotPlace'); s.value = v; s.dispatchEvent(new Event('change')); }, place);
  const box = await p.locator('#viewport').boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 6 });
    R.rotCounts[place] = await countRot(); await p.mouse.up();
}
checks.rot_exactly_one_place = R.rotCounts.panel.length === 1 && R.rotCounts.view.length === 1 && R.rotCounts.off.length === 0;
await p.evaluate(() => { const s = document.getElementById('optRotPlace'); s.value = 'panel'; s.dispatchEvent(new Event('change')); });
R.rotText = await p.evaluate(() => document.getElementById('rotReadoutText').textContent);
checks.rot_text_format = /^(자유 회전 · 좌우 [+−]\d+\.\d° · 위아래 [+−]\d+\.\d°|축 잠금 ·)/.test(R.rotText);
for (const t of ['tabDesign', 'tabBox', 'tabExport']) { await p.click('#' + t).catch(() => {}); R['bar_' + t] = await p.evaluate(() => { const r = document.getElementById('statusBar').getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.height)]; }); }
checks.statusbar_same_place_every_tab = new Set(Object.entries(R).filter(([k]) => k.startsWith('bar_')).map(([, v]) => JSON.stringify(v))).size === 1;
// 5) 손 도구 안내: Space 중 상태줄에 표시, 패널 접힘이면 알림 영역
await p.mouse.move(600, 400);
await p.keyboard.down('Space'); await p.waitForTimeout(250);
R.pan = await p.evaluate(() => ({ bar: getComputedStyle(document.getElementById('panBadge')).display !== 'none', top: !document.getElementById('panHintTop').hidden }));
await p.keyboard.up('Space');
checks.pan_hint_in_statusbar = R.pan.bar && !R.pan.top;
await p.click('#panelToggle'); await p.mouse.move(600, 400); await p.keyboard.down('Space'); await p.waitForTimeout(250);
R.panCollapsed = await p.evaluate(() => ({ top: !document.getElementById('panHintTop').hidden && !document.getElementById('panHintTop').classList.contains('note-hidden') })); await p.keyboard.up('Space');
checks.pan_hint_in_notify_when_collapsed = R.panCollapsed.top;
await p.evaluate(() => document.getElementById('panelExpand')?.click());
// 6) 깨끗한 화면: 알림은 기록에만, 해제 뒤 다시 뜨지 않음
await trigger('ok'); await p.keyboard.press('h'); await p.waitForTimeout(200);
await trigger('error').catch(() => {});
R.clean = await p.evaluate(() => ({ topShown: getComputedStyle(document.getElementById('topBar')).display !== 'none', msgHidden: document.getElementById('msg').hidden }));
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
checks.clean_screen_records_only = !R.clean.topShown && R.clean.msgHidden && (await p.evaluate(() => document.getElementById('msg').hidden));
// 7) 모든 창 크기: 표시되는 알림·배지 요소가 #viewport 와 겹치지 않음(허용: 하단 시점 바), 크기 불변
R.sizes = {};
const OVERLAP = ['msg', 'draftToast', 'extGlbBanner', 'panHintTop', 'statusBar', 'rotReadout', 'zoomReadout'];
for (const [w, h] of [[1920, 1080], [1366, 768], [1024, 768], [390, 844]]) {
  await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(300);
  const r = await p.evaluate((ids) => { const vp = document.getElementById('viewport').getBoundingClientRect(); return ids.map((id) => { const e = document.getElementById(id); const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); const shown = b.width > 0 && b.height > 0 && cs.display !== 'none'; const ov = shown && b.left < vp.right && b.right > vp.left && b.top < vp.bottom && b.bottom > vp.top; return [id, shown, ov]; }); }, OVERLAP);
  R.sizes[`${w}x${h}`] = r.filter((x) => x[2]).map((x) => x[0]);
}
checks.no_overlap_on_viewport = Object.values(R.sizes).every((a) => a.length === 0);
checks.no_page_errors = errs.length === 0;
R.checks = checks;
fs.writeFileSync(path.join(OUT, 'overlay_cleanup_task29.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify(checks));
await b.close();
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);

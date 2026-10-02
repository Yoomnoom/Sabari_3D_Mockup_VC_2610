// 비율 변경 알림 검증: SABARI_URL=http://127.0.0.1:8766/ node e2e/ratio.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), V = path.join(ROOT, 'verification'), S = path.join(ROOT, 'assets', 'samples');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
const R = {}; const rec = (k, v) => { R[k] = v; };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(250);
const putImage = async (id, file) => { await p.evaluate((id) => window.__sabari.setCurrent(id), id); await p.setInputFiles('#filePick', file); await p.waitForFunction((id) => window.__sabari.faces[id].img, id); };
const setDim = async (key, v) => { if (!(await p.evaluate(() => document.getElementById('dDims').open))) await p.click('#dDims > summary'); await p.locator(`#dim_outer_${key}`).scrollIntoViewIfNeeded(); await p.fill(`#dim_outer_${key}`, String(v)); };
const ui = () => p.evaluate(() => {
  const vis = (id) => { const e = document.getElementById(id); return !!e && !e.hidden && e.getClientRects().length > 0; };
  return {
    banner: vis('ratioBanner'), bannerText: vis('ratioBanner') ? document.getElementById('ratioBannerText').textContent : '',
    badges: [...document.querySelectorAll('#faceList button')].filter((b) => b.querySelector('.badge')).map((b) => b.dataset.face),
    note: vis('ratioNote') ? document.getElementById('ratioNoteText').textContent : '', selected: window.__sabari.viewer.selected,
  };
});
const sleep = (ms) => p.waitForTimeout(ms);
const ratioText = (w, h) => (w / h).toFixed(2) + ':1';

// 이미지는 base_front 와 lid_front 에만 넣는다 (나머지 면은 비워 둔다)
await p.check('#useBase');
await putImage('base_front', path.join(S, 'sample_base_front.png'));
await putImage('lid_front', path.join(S, 'sample_lid_front.png'));
rec('0_initial_no_alert', await ui());

// ===== 3-1. 임계값 미만의 작은 변경: 면 크기 표기는 갱신하되 알리지 않는다 =====
await setDim('baseW', 162); await sleep(1300);
rec('1_small_change_no_alert', await ui());
rec('1_face_size_still_updates', await (async () => { await p.evaluate(() => window.__sabari.setCurrent('base_front')); return p.textContent('#faceSize'); })());
await setDim('baseW', 160); await sleep(1300);

// ===== 3-2. 큰 변경(높이 43→60): 이미지 있는 면(base_front)만 알린다 =====
await p.click('#btnClose'); await sleep(100);
await setDim('baseH', 60);
const t0 = Date.now();
await sleep(300);
rec('2_not_yet_during_debounce', (await ui()).banner); // 입력이 멈춘 뒤 약 0.8초 뒤에 한 번 갱신
await sleep(1100);
const a = await ui(); rec('2_after_change', a);
const expFrom = ratioText(160, 43), expTo = ratioText(160, 60);
rec('2_expected_text', { from: expFrom, to: expTo, pct: Math.round((160 / 60 / (160 / 43) - 1) * 100) });
// 배너 [자세히]
await p.click('#btnRatioDetail'); rec('2_detail_list', await p.evaluate(() => [...document.querySelectorAll('#ratioDetail li')].map((l) => l.textContent)));
await p.screenshot({ path: path.join(V, '31_ratio_alert.png') });
// 패널 줄(선택된 면 = base_front)
rec('2_panel_line_for_base_front', await (async () => { await p.evaluate(() => window.__sabari.setCurrent('base_front')); await sleep(100); return (await ui()).note; })());
// 이미지가 없는 면(base_back, base_left)은 비율이 같이 바뀌어도 알리지 않는다
rec('2_empty_faces_not_alerted', { badges: a.badges, hasBaseBackAlert: a.badges.includes('base_back'), hasBaseLeftAlert: a.badges.includes('base_left') });
// 이미지 없는 면 선택 시 패널 줄 없음
rec('2_no_note_on_empty_face', await (async () => { await p.evaluate(() => window.__sabari.setCurrent('base_back')); await sleep(80); return (await ui()).note; })());

// ===== 닫기: 배너만 닫히고 배지는 남는다 / 같은 변경에서 다시 뜨지 않는다 =====
await p.click('#btnRatioClose'); await sleep(150);
const closed = await ui(); rec('3_after_close', { banner: closed.banner, badges: closed.badges });
await sleep(1000); rec('3_not_reshown_same_change', (await ui()).banner);
// 새 변경이면 다시 알린다
await setDim('baseH', 65); await sleep(1400);
rec('3_new_change_shows_again', (await ui()).banner);

// ===== 원래 사이즈로 되돌리기(배너 버튼): 비율이 돌아오면 알림·배지 자동 해제 =====
await p.click('#btnRatioRevert'); await sleep(400);
const reverted = await ui(); rec('4_after_revert', { ...reverted, baseH: (await p.evaluate(() => window.__sabari.getParams())).baseH });

// ===== 실행 취소로 비율 복귀 시 자동 해제 =====
await setDim('baseH', 60); await sleep(1400); rec('5_alert_again', (await ui()).badges);
await p.mouse.click(1000, 820); await p.keyboard.press('Control+z'); await sleep(500);
rec('5_after_ctrl_z_auto_clear', await ui());
await p.keyboard.press('Control+y'); await sleep(500); rec('5_after_ctrl_y_alert', (await ui()).badges);

// ===== 확인했어요: 그 면의 배지만 사라진다 =====
await putImage('base_left', path.join(S, 'sample_base_left.png')); // 하나 더 (높이가 60인 상태에서 넣었으니 알림 없음)
rec('6_new_image_no_alert', (await ui()).badges);
await setDim('baseH', 50); await sleep(1400);
const two = await ui(); rec('6_two_alerts', { badges: two.badges, banner: two.bannerText });
await p.evaluate(() => window.__sabari.setCurrent('base_front')); await sleep(100);
await p.click('#btnRatioAck'); await sleep(200);
const ack = await ui(); rec('6_after_ack_base_front', { badges: ack.badges, note: ack.note, banner: ack.banner, bannerText: ack.bannerText });
// 확인한 비율을 기준으로 다시 비교: 같은 값으로는 다시 알리지 않는다
await sleep(1000); rec('6_ack_stays', (await ui()).badges);

// ===== 이미지를 새로 넣거나 면을 초기화하면 그 면의 배지가 사라진다 =====
await p.evaluate(() => window.__sabari.setCurrent('base_left')); await sleep(100);
rec('7_before_reset', (await ui()).badges);
await p.click('#btnReset'); await sleep(200); rec('7_after_reset_badge_gone', (await ui()).badges);
await setDim('baseH', 43); await sleep(1400); await setDim('baseH', 58); await sleep(1400);
rec('7_alert_again', (await ui()).badges);
await putImage('base_front', path.join(S, 'sample_base_front.png')); await sleep(200); // 새 이미지로 교체
rec('7_new_image_clears_that_face', (await ui()).badges);

// ===== 프로젝트 저장 → 새 컨텍스트에서 열 때는 알림을 띄우지 않는다 =====
const [pj] = await Promise.all([p.waitForEvent('download'), p.click('#btnProjSave')]); const proj = path.join(V, 'ratio_changed.sabari'); await pj.saveAs(proj);
const c2 = await b.newContext({ viewport: { width: 1360, height: 900 } }); const p2 = await c2.newPage();
await p2.goto(URL); await p2.waitForFunction(() => window.__sabari);
await p2.setInputFiles('#fileProj', proj); await p2.waitForFunction(() => Object.values(window.__sabari.faces).filter((f) => f.img).length >= 3, null, { timeout: 15000 }); await p2.waitForTimeout(1500);
rec('8_open_no_alert', await p2.evaluate(() => ({ banner: !document.getElementById('ratioBanner').hidden, badges: document.querySelectorAll('.badge').length, baseH: window.__sabari.getParams().baseH })));
// 열린 뒤 이번 세션에서 바꾸면 알린다
await p2.click('#dDims > summary'); await p2.fill('#dim_outer_baseH', '43'); await p2.waitForTimeout(1500);
rec('8_open_then_change_alerts', await p2.evaluate(() => ({ banner: !document.getElementById('ratioBanner').hidden, tabs: [document.getElementById('tab_lid').textContent, document.getElementById('tab_base').textContent] })));
await c2.close();

// ===== 이미지 없는 면만 있는 상태에서 큰 변경: 알림 없음 =====
const c3 = await b.newContext({ viewport: { width: 1360, height: 900 } }); const p3 = await c3.newPage();
await p3.goto(URL); await p3.waitForFunction(() => window.__sabari);
await p3.click('#dDims > summary'); await p3.fill('#dim_outer_baseH', '90'); await p3.fill('#dim_outer_lidH', '70'); await p3.waitForTimeout(1500);
rec('9_no_images_no_alert', await p3.evaluate(() => ({ banner: !document.getElementById('ratioBanner').hidden, badges: document.querySelectorAll('.badge').length })));
await c3.close();

rec('errors', errs);
fs.writeFileSync(path.join(V, 'ratio_results.json'), JSON.stringify(R, null, 2));
console.log(JSON.stringify(R)); await b.close();
